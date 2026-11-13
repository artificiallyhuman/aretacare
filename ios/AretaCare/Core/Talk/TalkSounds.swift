import AVFoundation

/// Short tones for Talk's mute button: two falling notes for muted, two rising for live.
///
/// Played with `AVAudioPlayer` through the call's own `.playAndRecord` audio session, so
/// they sound even with the ringer switch on silent (system sounds would not). The tones
/// are synthesized once, so there is no audio asset to ship.
@MainActor
enum TalkSounds {
    enum Cue {
        case muted
        case unmuted
    }

    /// Long enough for the unmute tone to finish before the microphone opens again.
    static let cueSeconds = 0.2

    private static var player: AVAudioPlayer?
    private static let mutedTone = makeTone(frequencies: [660, 440])
    private static let unmutedTone = makeTone(frequencies: [440, 660])

    static func play(_ cue: Cue) {
        let data = cue == .muted ? mutedTone : unmutedTone
        guard let player = try? AVAudioPlayer(data: data) else { return }
        player.volume = 0.4
        player.play()
        self.player = player  // kept until the next cue so it isn't released mid-play
    }

    // MARK: - Synthesis

    private static func makeTone(frequencies: [Double]) -> Data {
        let sampleRate = 44_100.0
        let noteSeconds = 0.075
        let gapSeconds = 0.02
        var samples: [Int16] = []
        for (index, frequency) in frequencies.enumerated() {
            let count = Int(sampleRate * noteSeconds)
            for i in 0..<count {
                let t = Double(i) / sampleRate
                // 5 ms attack and 25 ms release, so the notes don't click.
                let envelope = max(0, min(1, t / 0.005, (noteSeconds - t) / 0.025))
                samples.append(Int16(sin(2 * .pi * frequency * t) * envelope * 0.6 * Double(Int16.max)))
            }
            if index < frequencies.count - 1 {
                samples.append(contentsOf: repeatElement(0, count: Int(sampleRate * gapSeconds)))
            }
        }
        return wavData(samples: samples, sampleRate: Int(sampleRate))
    }

    /// 16-bit mono PCM in a minimal RIFF/WAVE container.
    private static func wavData(samples: [Int16], sampleRate: Int) -> Data {
        let dataSize = samples.count * 2
        var data = Data()
        func append<T: FixedWidthInteger>(_ value: T) {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        data.append(contentsOf: Array("RIFF".utf8)); append(UInt32(36 + dataSize))
        data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); append(UInt32(16))
        append(UInt16(1)); append(UInt16(1))                      // PCM, mono
        append(UInt32(sampleRate)); append(UInt32(sampleRate * 2)) // sample rate, byte rate
        append(UInt16(2)); append(UInt16(16))                     // block align, bits per sample
        data.append(contentsOf: Array("data".utf8)); append(UInt32(dataSize))
        for sample in samples { append(sample) }
        return data
    }
}
