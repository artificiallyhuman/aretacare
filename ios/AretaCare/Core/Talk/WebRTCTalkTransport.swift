#if canImport(WebRTC)
import AVFoundation
import Foundation
import WebRTC

/// `TalkTransport` on libwebrtc.
///
/// - One microphone track out, one remote audio track in, and a data channel named
///   `oai-events` that must exist before the offer is created.
/// - Echo cancellation is the client's job for a full-duplex call on a speaker, so the
///   audio session runs in `.voiceChat` mode (hardware AEC/AGC/noise suppression).
/// - Levels for the orb come from the connection's own statistics, so no audio taps.
@MainActor
final class WebRTCTalkTransport: NSObject, TalkTransport {
    var onEvent: ((TalkTransportEvent) -> Void)?

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }()

    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var audioTrack: RTCAudioTrack?
    private var gatheringContinuation: CheckedContinuation<Void, Never>?
    private var isClosed = false
    private var mediaConnected = false
    private var sessionStarted = false
    private var reportedReady = false
    private var disconnectTask: Task<Void, Never>?

    // MARK: - TalkTransport

    func makeOffer() async throws -> String {
        try configureAudioSession()

        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
        configuration.continualGatheringPolicy = .gatherOnce
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let connection = Self.factory.peerConnection(
            with: configuration, constraints: constraints, delegate: self
        ) else {
            throw TalkTransportError.setupFailed("peer connection")
        }
        peerConnection = connection

        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["googEchoCancellation": "true", "googNoiseSuppression": "true", "googAutoGainControl": "true"]
        )
        let source = Self.factory.audioSource(with: audioConstraints)
        let track = Self.factory.audioTrack(with: source, trackId: "talk-mic")
        audioTrack = track
        connection.add(track, streamIds: ["talk"])

        let channelConfiguration = RTCDataChannelConfiguration()
        channelConfiguration.isOrdered = true
        guard let channel = connection.dataChannel(forLabel: "oai-events", configuration: channelConfiguration) else {
            throw TalkTransportError.setupFailed("data channel")
        }
        channel.delegate = self
        dataChannel = channel

        let offerConstraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": "false"],
            optionalConstraints: nil
        )
        let offer: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
            connection.offer(for: offerConstraints) { description, error in
                if let description {
                    continuation.resume(returning: description)
                } else {
                    continuation.resume(throwing: error ?? TalkTransportError.setupFailed("offer"))
                }
            }
        }
        try await setLocalDescription(offer, on: connection)
        await waitForIceGathering(on: connection)

        guard let sdp = connection.localDescription?.sdp else {
            throw TalkTransportError.setupFailed("local description")
        }
        return sdp
    }

    func applyAnswer(_ sdp: String) async throws {
        guard let connection = peerConnection, !isClosed else {
            throw TalkTransportError.setupFailed("closed")
        }
        let answer = RTCSessionDescription(type: .answer, sdp: sdp)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.setRemoteDescription(answer) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func currentLevels() async -> TalkAudioLevels {
        guard let connection = peerConnection, !isClosed else {
            return TalkAudioLevels(user: 0, agent: 0)
        }
        return await withCheckedContinuation { continuation in
            connection.statistics { report in
                var user = 0.0
                var agent = 0.0
                for statistic in report.statistics.values {
                    guard (statistic.values["kind"] as? String) == "audio",
                          let level = (statistic.values["audioLevel"] as? NSNumber)?.doubleValue else { continue }
                    if statistic.type == "media-source" {
                        user = max(user, level)
                    } else if statistic.type == "inbound-rtp" {
                        agent = max(agent, level)
                    }
                }
                continuation.resume(returning: TalkAudioLevels(user: user, agent: agent))
            }
        }
    }

    func setMuted(_ muted: Bool) {
        guard !isClosed else { return }
        // A disabled track sends silence frames, so the session sees a quiet microphone
        // rather than a dropped stream.
        audioTrack?.isEnabled = !muted
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        disconnectTask?.cancel()
        gatheringContinuation?.resume()
        gatheringContinuation = nil
        audioTrack?.isEnabled = false
        dataChannel?.delegate = nil
        dataChannel?.close()
        peerConnection?.delegate = nil
        peerConnection?.close()
        dataChannel = nil
        audioTrack = nil
        peerConnection = nil
        releaseAudioSession()
    }

    // MARK: - Setup helpers

    private func setLocalDescription(_ description: RTCSessionDescription, on connection: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.setLocalDescription(description) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /// The offer is exchanged once, so wait for candidates — but never indefinitely:
    /// on some networks gathering never reports "complete".
    private func waitForIceGathering(on connection: RTCPeerConnection) async {
        guard connection.iceGatheringState != .complete else { return }
        let timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            self?.gatheringContinuation?.resume()
            self?.gatheringContinuation = nil
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            if connection.iceGatheringState == .complete || isClosed {
                continuation.resume()
            } else {
                gatheringContinuation = continuation
            }
        }
        timeout.cancel()
    }

    private func configureAudioSession() throws {
        let configuration = RTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        configuration.mode = AVAudioSession.Mode.voiceChat.rawValue
        // Bluetooth hands-free. Spelled by raw value because the SDK renamed the option
        // (`allowBluetooth` → `allowBluetoothHFP`) and CI builds with a different Xcode.
        let bluetoothHandsFree = AVAudioSession.CategoryOptions(rawValue: 0x4)
        configuration.categoryOptions = [.defaultToSpeaker, bluetoothHandsFree]
        RTCAudioSessionConfiguration.setWebRTC(configuration)

        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        try session.setConfiguration(configuration, active: true)
    }

    private func releaseAudioSession() {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        try? session.setActive(false)
        session.unlockForConfiguration()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Event handling (main actor)

    private func reportReadyIfNeeded() {
        guard mediaConnected, sessionStarted, !reportedReady, !isClosed else { return }
        reportedReady = true
        onEvent?(.ready)
    }

    private func handleConnectionState(_ state: RTCIceConnectionState) {
        guard !isClosed else { return }
        switch state {
        case .connected, .completed:
            disconnectTask?.cancel()
            disconnectTask = nil
            mediaConnected = true
            reportReadyIfNeeded()
        case .disconnected:
            // Often transient (a network handover). Give it a few seconds to recover.
            disconnectTask?.cancel()
            disconnectTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(6))
                guard !Task.isCancelled, let self, !self.isClosed else { return }
                self.onEvent?(.connectionLost)
            }
        case .failed, .closed:
            onEvent?(.connectionLost)
        default:
            break
        }
    }

    private func handleServerMessage(_ data: Data) {
        guard !isClosed,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return }
        switch type {
        case "session.started":
            sessionStarted = true
            reportReadyIfNeeded()
        case "session.delegation.created":
            onEvent?(.working)
        case "session.closed":
            onEvent?(.closedByServer(reason: (object["reason"] as? String) ?? "closed"))
        case "error":
            let code = (object["error"] as? [String: Any])?["code"] as? String
            onEvent?(.serverError(code: code))
        default:
            break
        }
    }
}

// MARK: - RTCPeerConnectionDelegate (called on WebRTC's signaling thread)

extension WebRTCTalkTransport: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in self.handleConnectionState(newState) }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        guard newState == .complete else { return }
        Task { @MainActor in
            self.gatheringContinuation?.resume()
            self.gatheringContinuation = nil
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

// MARK: - RTCDataChannelDelegate

extension WebRTCTalkTransport: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {}

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        Task { @MainActor in self.handleServerMessage(data) }
    }
}
#endif
