import CarPlay
import UIKit

/// Runs AretaCare on the CarPlay screen.
///
/// Landing screen: a grid of four one-tap starts (Talk, Catch me up, Before a visit,
/// After a visit), titled with the care session's name, plus Switch when there is more
/// than one care session. A tap opens the voice screen and starts a Talk call. Apple's
/// rules for the category (CarPlay Developer Guide, Oct 2026): voice first, no text or
/// images in answers, at most three templates deep, the microphone only with the voice
/// control template, and never a message telling the driver to pick up the phone.
@available(iOS 26.4, *)
@MainActor
final class CarPlayCoordinator {
    private let interfaceController: CPInterfaceController
    private var sessionVM = SessionViewModel()
    private var grid: CPGridTemplate?
    private var callScreen: CarPlayCallScreen?
    private var observers: [NSObjectProtocol] = []
    /// False once the car disconnects: work that was waiting on the network must not start
    /// a call (with an open microphone) after the car's screen is gone.
    private var isConnected = false
    private var startTask: Task<Void, Never>?
    /// A tap's checks are running (network, sign-in, care session). Cleared before the call
    /// itself begins: from then on the voice screen (and its End) represents the attempt,
    /// so a stalled request can never leave the grid ignoring taps.
    private var preparing: UUID?
    private var isPreparing: Bool { preparing != nil }
    private var isLoadingSessions = false

    /// The modal template that should be up (an alert or the voice screen), reconciled one
    /// step at a time: CarPlay presents one modal at a time, and `presentedTemplate` isn't
    /// updated until an animated present finishes.
    private var desiredModal: CPTemplate?
    private var isChangingModal = false

    /// Calls started from CarPlay that are still waiting for their result. The view model's
    /// result poll (which reloads the phone's chat card and reports a failed save) holds it
    /// weakly, and `TalkViewModel.current` lets go when the call ends.
    private static var callsAwaitingResult: [TalkViewModel] = []

    init(interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
    }

    // MARK: - Connection

    func connect() {
        isConnected = true
        let grid = makeGrid()
        self.grid = grid
        interfaceController.setRootTemplate(grid, animated: false, completion: nil)

        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: TalkViewModel.callDidStartNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.showLiveCallIfAny() }
        })
        observers.append(center.addObserver(forName: .userDidLogout, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.signedOut() }
        })
        observers.append(center.addObserver(forName: .sessionsDidChange, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        })

        Task { await loadSessions() }
        observeSignIn()
        // A call started on the phone before the car connected: its audio has moved to the
        // car, so the driver needs its Mute and End.
        showLiveCallIfAny()
    }

    /// Signing in on the phone while connected: the grid's title and Switch follow.
    private func observeSignIn() {
        withObservationTracking {
            _ = AuthManager.shared.isAuthenticated
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.isConnected else { return }
                if AuthManager.shared.isAuthenticated { await self.loadSessions() }
                self.observeSignIn()
            }
        }
    }

    /// The car disconnected (or the driver unplugged). A call started here ends rather than
    /// carrying on through the phone's speaker; a call started on the phone is left alone.
    func disconnect() {
        isConnected = false
        startTask?.cancel()
        startTask = nil
        preparing = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        callScreen?.detach()
        callScreen = nil
        if let live = TalkViewModel.current, live.surface == .carPlay, live.isActive {
            Task { await live.end() }
        }
    }

    /// The CarPlay screen came back to the foreground.
    func refresh() {
        Task { await loadSessions() }
        showLiveCallIfAny()
    }

    // MARK: - Landing grid

    private func makeGrid() -> CPGridTemplate {
        let buttons: [CPGridButton] = [
            gridButton(["Talk"], symbol: "waveform", opening: nil),
            gridButton(["Catch me up", "Catch up"], symbol: "sun.horizon", opening: .catchUp),
            gridButton(["Before a visit", "Before visit"], symbol: "list.clipboard", opening: .visitPrep),
            gridButton(["After a visit", "After visit"], symbol: "square.and.pencil", opening: .visitDebrief),
        ]
        return CPGridTemplate(title: "AretaCare", gridButtons: buttons)
    }

    private func gridButton(_ titles: [String], symbol: String, opening: TalkOpening?) -> CPGridButton {
        CPGridButton(titleVariants: titles, image: CarPlayImages.gridIcon(symbol)) { [weak self] _ in
            self?.startCall(opening: opening)
        }
    }

    private func updateGrid() {
        guard let grid else { return }
        grid.updateTitle(sessionVM.currentSession?.name ?? "AretaCare")
        if sessionVM.sessions.count > 1 {
            let switchButton = CPBarButton(title: "Switch") { [weak self] _ in self?.showSessionPicker() }
            grid.trailingNavigationBarButtons = [switchButton]
        } else {
            grid.trailingNavigationBarButtons = []
        }
    }

    private func loadSessions() async {
        // Connect and the scene's first foreground both ask; one load is enough.
        guard !isLoadingSessions else { return }
        isLoadingSessions = true
        defer { isLoadingSessions = false }
        await AppBootstrap.shared.start()
        guard isConnected else { return }
        guard AuthManager.shared.isAuthenticated else {
            updateGrid()
            return
        }
        // Follow the care session most recently chosen on either screen. Read it before the
        // fetch: a first fetch restores from the sign-in-time server value and records that
        // here, overwriting a newer choice made on the phone.
        let chosen = UserDefaults.standard.string(forKey: "lastSessionId")
        await sessionVM.fetchSessions()
        guard isConnected else { return }
        if let chosen, chosen != sessionVM.currentSession?.id,
           let session = sessionVM.sessions.first(where: { $0.id == chosen }) {
            sessionVM.switchSession(to: session)
        }
        updateGrid()
    }

    // MARK: - Care session picker (template depth 2)

    private func showSessionPicker() {
        AuthManager.shared.recordActivity()
        // A recording on the phone belongs to the care session it started in, and the phone's
        // recorders stop (and discard) when the chosen care session changes under them.
        guard !AudioRecorderManager.isRecordingInProgress else {
            showAlert("AretaCare is recording on your iPhone.")
            return
        }
        let currentId = sessionVM.currentSession?.id
        let sessions = sessionVM.sessions.sorted { $0.lastActivity > $1.lastActivity }
        let items: [CPListItem] = sessions.prefix(Int(CPListTemplate.maximumItemCount)).map { session in
            let item = CPListItem(text: session.name, detailText: session.id == currentId ? "Current" : nil)
            item.handler = { [weak self] _, completion in
                self?.choose(session)
                completion()
            }
            return item
        }
        let list = CPListTemplate(title: "Care Sessions", sections: [CPListSection(items: items)])
        interfaceController.pushTemplate(list, animated: true, completion: nil)
    }

    private func choose(_ session: SessionResponse) {
        AuthManager.shared.recordActivity()
        if session.id != sessionVM.currentSession?.id {
            sessionVM.switchSession(to: session)
        }
        updateGrid()
        interfaceController.popToRootTemplate(animated: true, completion: nil)
    }

    // MARK: - Calls

    private func startCall(opening: TalkOpening?) {
        AuthManager.shared.recordActivity()
        if let live = TalkViewModel.current, live.isActive {
            showCallScreen(for: live)
            return
        }
        guard !isPreparing else { return }
        let token = UUID()
        preparing = token
        startTask = Task { [weak self] in
            await self?.prepareAndStart(opening: opening, token: token)
        }
    }

    private func prepareAndStart(opening: TalkOpening?, token: UUID) async {
        defer { if preparing == token { preparing = nil } }
        guard NetworkMonitor.shared.isConnected else {
            showAlert("Talk needs an internet connection.")
            return
        }
        // Recording on the phone (the visit itself, say): Talk would take its microphone.
        guard !AudioRecorderManager.isRecordingInProgress else {
            showAlert("AretaCare is recording on your iPhone.")
            return
        }
        await AppBootstrap.shared.start()
        guard isConnected, !Task.isCancelled else { return }
        let auth = AuthManager.shared
        guard auth.isAuthenticated else {
            showAlert(auth.startupErrorMessage == nil
                      ? "You're signed out of AretaCare."
                      : "AretaCare can't connect right now. Try again in a moment.")
            return
        }
        guard auth.hasAcceptedAIDataSharing else {
            showAlert(TalkViewModel.notSetUpInCar)
            return
        }
        if sessionVM.currentSession == nil {
            await sessionVM.fetchSessions()
            guard isConnected, !Task.isCancelled else { return }
            updateGrid()
        }
        guard let sessionId = sessionVM.currentSession?.id else {
            showAlert(sessionVM.errorMessage == nil
                      ? "No care session yet."
                      : "AretaCare couldn't load your care sessions. Try again in a moment.")
            return
        }
        // A call started on the phone during the checks above: show that one instead.
        if let live = TalkViewModel.current, live.isActive {
            showCallScreen(for: live)
            return
        }
        let talk = TalkViewModel(surface: .carPlay)
        Self.callsAwaitingResult.removeAll { !$0.isActive && !$0.isAwaitingResult }
        Self.callsAwaitingResult.append(talk)
        showCallScreen(for: talk)
        // `begin` claims `TalkViewModel.current` before its first await, so a tap from here on
        // shows this call's voice screen instead of starting another.
        if preparing == token { preparing = nil }
        await talk.begin(sessionId: sessionId, opening: opening)
    }

    /// A call is live (started here, or on the phone): show the voice screen for it, so the
    /// driver can mute or end it.
    private func showLiveCallIfAny() {
        guard isConnected, let live = TalkViewModel.current, live.isActive else { return }
        showCallScreen(for: live)
    }

    private func showCallScreen(for talk: TalkViewModel) {
        if let callScreen, callScreen.talk === talk {
            setModal(callScreen.template)  // already built; make sure it's the one up
            return
        }
        callScreen?.detach()
        let screen = CarPlayCallScreen(talk: talk, scale: interfaceController.carTraitCollection.displayScale) {
            [weak self] screen, notice in
            self?.callScreenClosed(screen, notice: notice)
        }
        callScreen = screen
        setModal(screen.template)
    }

    private func callScreenClosed(_ screen: CarPlayCallScreen, notice: TalkViewModel.Notice?) {
        if callScreen === screen { callScreen = nil }
        if let notice {
            showAlert(notice.message, shorter: notice.title)
        } else if desiredModal === screen.template {
            setModal(nil)
        }
    }

    private func signedOut() {
        // AuthManager already ended any call; its voice screen closes on its own. Say why,
        // if the driver was starting or in a call: otherwise it would just disappear.
        let wasInCall = isPreparing || callScreen != nil
        startTask?.cancel()
        preparing = nil
        for talk in Self.callsAwaitingResult { talk.cancelResultPolling() }
        Self.callsAwaitingResult = []
        sessionVM = SessionViewModel()
        updateGrid()
        interfaceController.popToRootTemplate(animated: false, completion: nil)
        if wasInCall { showAlert("You're signed out of AretaCare.") }
    }

    // MARK: - Modal templates

    private func setModal(_ template: CPTemplate?) {
        desiredModal = template
        reconcileModal()
    }

    private func reconcileModal() {
        guard isConnected, !isChangingModal else { return }
        let shown = interfaceController.presentedTemplate
        if shown === desiredModal { return }
        isChangingModal = true
        if shown != nil {
            interfaceController.dismissTemplate(animated: desiredModal == nil) { [weak self] _, _ in
                Task { @MainActor in
                    self?.isChangingModal = false
                    self?.reconcileModal()
                }
            }
        } else if let desired = desiredModal {
            interfaceController.presentTemplate(desired, animated: true) { [weak self] presented, _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.isChangingModal = false
                    if !presented, self.desiredModal === desired {
                        self.desiredModal = nil  // don't retry a template CarPlay refused
                        // A refused voice screen is rebuilt on the next tap, not kept unseen
                        // (its call would have no Mute or End).
                        if let callScreen = self.callScreen, callScreen.template === desired {
                            callScreen.detach()
                            self.callScreen = nil
                        }
                    }
                    if presented, let callScreen = self.callScreen, callScreen.template === desired {
                        callScreen.didAppear()
                    }
                    self.reconcileModal()
                }
            }
        } else {
            isChangingModal = false
        }
    }

    /// A short message with OK. Wording rule: say what's wrong, never tell the driver to use
    /// the phone. `shorter` is used where the car's screen has less room.
    private func showAlert(_ message: String, shorter: String? = nil) {
        guard isConnected else { return }
        let ok = CPAlertAction(title: "OK", style: .cancel) { [weak self] _ in
            self?.setModal(nil)
        }
        let alert = CPAlertTemplate(titleVariants: [message] + (shorter.map { [$0] } ?? []), actions: [ok])
        setModal(alert)
    }
}
