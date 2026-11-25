import CarPlay
import UIKit

/// Runs AretaCare on the CarPlay screen.
///
/// Landing screen: a grid of four one-tap starts (Talk, Catch me up, Before a visit, After a
/// visit) as round colored tiles, under a navigation bar that reads "Care session" with the
/// care session's name on a rounded button beside it, which opens the list of care sessions.
/// One layout for every car: an app that isn't a navigation app can't measure the car's
/// screen (its `carWindow` is only laid out for navigation apps), and CarPlay centers a grid
/// on any screen, where a list (or buttons pinned above one) left a tall screen's lower half
/// empty in the Subaru. A start opens the voice screen and starts a Talk call. Apple's
/// rules for the category (CarPlay Developer Guide, Oct 2026): voice first, no text or
/// images in answers, at most three templates deep, the microphone only with the voice
/// control template, and never a message telling the driver to pick up the phone.
@available(iOS 26.4, *)
@MainActor
final class CarPlayCoordinator {
    private let interfaceController: CPInterfaceController
    private var sessionVM = SessionViewModel()
    private var landing: CPGridTemplate?
    /// What the landing screen's navigation bar shows now (its title, and the care session's
    /// name on the button), so an unchanged one isn't sent to the car again.
    private var shownHeader: (title: String, sessionName: String?, sharedWith: String?)?
    /// Hears when the system closes the voice screen itself (its navigation bar button).
    private let templateEvents = TemplateEvents()
    private var callScreen: CarPlayCallScreen?
    private var observers: [NSObjectProtocol] = []
    /// False once the car disconnects: work that was waiting on the network must not start
    /// a call (with an open microphone) after the car's screen is gone.
    private var isConnected = false
    private var startTask: Task<Void, Never>?
    /// A tap's checks are running (network, sign-in, care session). Cleared before the call
    /// itself begins: from then on the voice screen (and its End) represents the attempt.
    /// The checks themselves wait on the network (a sign-in restore, the care session list),
    /// so they give up after `prepareTimeoutSeconds` and say so, rather than leave the
    /// landing screen ignoring taps.
    private var preparing: UUID?
    private static let prepareTimeoutSeconds: Double = 15
    private var isPreparing: Bool { preparing != nil }
    private var isLoadingSessions = false
    /// The first load (sign-in restore included) has finished: until then the landing
    /// screen can't say whether someone is signed in.
    private var hasLoadedOnce = false

    /// The modal template that should be up (an alert or the voice screen), reconciled one
    /// step at a time: CarPlay presents one modal at a time, and `presentedTemplate` isn't
    /// updated until an animated present finishes.
    private var desiredModal: CPTemplate?
    private var isChangingModal = false
    /// The present or dismiss in flight. Its completion is expected, but CarPlay doesn't
    /// promise one for every case, and a change that never finished would block every later
    /// alert and voice screen: after `modalChangeTimeoutSeconds` the next one goes ahead.
    private var modalChange: UUID?
    private static let modalChangeTimeoutSeconds: Double = 4

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
        templateEvents.didDisappear = { [weak self] template in self?.templateDidDisappear(template) }
        templateEvents.didAppear = { [weak self] template in
            // Back from another CarPlay app: bring the voice screen up to date.
            if let callScreen = self?.callScreen, callScreen.template === template {
                callScreen.didAppear()
            }
        }
        interfaceController.delegate = templateEvents
        let landing = makeLanding()
        self.landing = landing
        updateLanding()
        // A completion, even an empty one: without it a refusal throws.
        interfaceController.setRootTemplate(landing, animated: false) { _, _ in }

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
        observers.append(center.addObserver(forName: .activeSessionDidChange, object: nil, queue: .main) {
            [weak self] notification in
            let chooser = (notification.object as AnyObject?).map(ObjectIdentifier.init)
            let sessionId = notification.userInfo?[SessionViewModel.sessionIdKey] as? String
            MainActor.assumeIsolated { self?.follow(sessionId: sessionId, chosenBy: chooser) }
        })

        Task { await loadSessions() }
        // Draw the voice screen's images now, so the first tap doesn't wait on them.
        Task { await CarPlayImages.prepareVoiceScreen(scale: carScale, dark: carIsDark) }
        observeSignIn()
        // A call started on the phone before the car connected: its audio has moved to the
        // car, so the driver needs its Mute and End.
        showLiveCallIfAny()
    }

    /// Signing in on the phone while connected: the care session row follows.
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
        templateEvents.didDisappear = nil
        templateEvents.didAppear = nil
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

    // MARK: - Landing screen

    /// The four one-tap starts as a grid: CarPlay sizes and centers a grid on any screen,
    /// wide or tall, where a list's content sits at the top and leaves a tall screen's lower
    /// half empty. Titles list a shorter variant for narrow buttons.
    private func makeLanding() -> CPGridTemplate {
        let buttons = Self.starts.map { start in
            let image = CarPlayImages.startTile(start.symbol, colors: start.colors, scale: carScale)
            return CPGridButton(titleVariants: start.titles, image: image) { [weak self] _ in
                self?.startCall(opening: start.opening)
            }
        }
        return CPGridTemplate(title: "AretaCare", gridButtons: buttons)
    }

    private struct Start {
        let titles: [String]
        let symbol: String
        let colors: CarPlayImages.Gradient
        let opening: TalkOpening?
    }

    private static let starts = [
        Start(titles: ["Talk"], symbol: "waveform", colors: CarPlayImages.talkColors, opening: nil),
        Start(titles: ["Catch me up", "Catch up"], symbol: "sun.horizon.fill",
              colors: CarPlayImages.catchUpColors, opening: .catchUp),
        Start(titles: ["Before a visit", "Before visit"], symbol: "list.clipboard.fill",
              colors: CarPlayImages.visitPrepColors, opening: .visitPrep),
        Start(titles: ["After a visit", "After visit"], symbol: "square.and.pencil",
              colors: CarPlayImages.visitDebriefColors, opening: .visitDebrief),
    ]

    /// The navigation bar reads as a label and its value: the title says "Care session" and
    /// the rounded button beside it carries the care session's name and opens the list of
    /// care sessions. A shared care session gets a second button saying who else can see it
    /// (like the line under the phone's chat title), which lists them. In the first car test the title was the bare name with a "Switch"
    /// button, and neither said it was about the care session. (The title is fixed and short,
    /// so a long care-session name can't push the label out on a narrow screen.) Without a
    /// care session there's no button, and the title says what's missing before anyone
    /// taps: "Not signed in" or "No care session"; AretaCare while sign-in is still being
    /// restored or can't reach the server. A tap on a start then says what to do.
    private func updateLanding() {
        guard let landing else { return }
        let auth = AuthManager.shared
        let session = auth.isAuthenticated ? sessionVM.currentSession : nil
        let title: String
        if session != nil {
            title = "Care session"
        } else if !hasLoadedOnce || auth.startupErrorMessage != nil {
            title = "AretaCare"
        } else if !auth.isAuthenticated {
            title = "Not signed in"
        } else if sessionVM.sessions.isEmpty, sessionVM.errorMessage == nil, !isLoadingSessions {
            title = "No care session"
        } else {
            title = "AretaCare"
        }
        let header = (title: title, sessionName: session?.name,
                      sharedWith: session.flatMap { Self.sharedWithText(otherPeople(in: $0)) })
        if let shownHeader, shownHeader == header { return }
        shownHeader = header
        if landing.title != header.title { landing.updateTitle(header.title) }
        var buttons: [CPBarButton] = []
        if let name = header.sessionName {
            let button = CPBarButton(title: name) { [weak self] _ in self?.showSessionPicker() }
            button.buttonStyle = .rounded
            buttons.append(button)
        }
        if let sharedWith = header.sharedWith {
            let button = CPBarButton(title: sharedWith) { [weak self] _ in self?.showPeople() }
            button.buttonStyle = .rounded
            buttons.append(button)
        }
        landing.trailingNavigationBarButtons = buttons
    }

    // MARK: - Who can see the care session

    /// First names of everyone else who can see the care session, owner first: the people
    /// the phone's chat title lists (`SessionTitleView`).
    private func otherPeople(in session: SessionResponse) -> [String] {
        let me = AuthManager.shared.currentUser?.id
        var names: [String] = []
        if session.ownerId != me { names.append(session.ownerName) }
        names += session.collaborators.filter { $0.userId != me }.map(\.name)
        return names.map(SessionTitleView.firstName)
    }

    /// The landing screen's second button when the care session is shared, beside its name:
    /// "With Sarah", "With Sarah & Tom", or a count when names would make it long (the bar
    /// also holds the title and the name, and car screens can be narrow). Nil when only you
    /// can see it: there's nothing to invite from the car, so the phone's "Only you · Invite"
    /// has no counterpart.
    static func sharedWithText(_ others: [String]) -> String? {
        guard !others.isEmpty else { return nil }
        let names = others.count == 1 ? others[0] : others.count == 2 ? "\(others[0]) & \(others[1])" : nil
        if let names, names.count <= 14 { return "With \(names)" }
        return others.count == 1 ? "With 1 person" : "With \(others.count) people"
    }

    /// Everyone who can see the care session (template depth 2): names only, the owner and
    /// you marked. Read-only; sharing is managed in the app.
    private func showPeople() {
        AuthManager.shared.recordActivity()
        // Already open (a tap delivered twice over a wireless link).
        guard interfaceController.topTemplate === landing, let session = sessionVM.currentSession else { return }
        let me = AuthManager.shared.currentUser?.id
        var people: [(name: String, detail: String?)] = [
            (session.ownerName, session.ownerId == me ? "Owner · You" : "Owner"),
        ]
        people += session.collaborators
            .filter { $0.userId != session.ownerId }
            .sorted { $0.addedAt < $1.addedAt }
            .map { ($0.name, $0.userId == me ? "You" : nil) }
        let icon = UIImage(systemName: "person.crop.circle.fill")
        let items = people.prefix(Int(CPListTemplate.maximumItemCount)).map { person in
            CPListItem(text: person.name, detailText: person.detail, image: icon)
        }
        let list = CPListTemplate(title: "Shared With", sections: [CPListSection(items: Array(items))])
        interfaceController.pushTemplate(list, animated: true) { _, _ in }  // a refusal without one throws
    }

    private var carScale: CGFloat { interfaceController.carTraitCollection.displayScale }
    /// Dark unless the car says light (the voice screen's background follows it).
    private var carIsDark: Bool { interfaceController.carTraitCollection.userInterfaceStyle != .light }

    private func loadSessions() async {
        // Connect and the scene's first foreground both ask; one load is enough.
        guard !isLoadingSessions else { return }
        isLoadingSessions = true
        defer {
            isLoadingSessions = false
            hasLoadedOnce = true
            updateLanding()
        }
        await AppBootstrap.shared.start()
        guard isConnected else { return }
        guard AuthManager.shared.isAuthenticated else { return }
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
    }

    /// A care session chosen on the phone: the car's row follows. (A choice made here is
    /// followed by the phone the same way, in `MainTabView`.)
    private func follow(sessionId: String?, chosenBy chooser: ObjectIdentifier?) {
        guard isConnected, let sessionId, chooser != ObjectIdentifier(sessionVM) else { return }
        if sessionVM.follow(sessionId: sessionId) {
            updateLanding()
        } else if sessionVM.currentSession?.id != sessionId {
            // Not in this list yet (just created on the phone): fetch, then follow.
            let vm = sessionVM
            Task { [weak self] in
                await vm.fetchSessions()
                guard let self, self.isConnected, vm === self.sessionVM else { return }
                vm.follow(sessionId: sessionId)
                self.updateLanding()
            }
        }
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
        // Already open (a tap delivered twice over a wireless link).
        guard interfaceController.topTemplate === landing else { return }
        let currentId = sessionVM.currentSession?.id
        let sessions = sessionVM.sessions.sorted { $0.lastActivity > $1.lastActivity }
        let items: [CPListItem] = sessions.prefix(Int(CPListTemplate.maximumItemCount)).map { session in
            // "Current", and who else can see it, as on the landing screen.
            let detail = [session.id == currentId ? "Current" : nil,
                          Self.sharedWithText(self.otherPeople(in: session))]
                .compactMap { $0 }.joined(separator: " · ")
            let item = CPListItem(text: session.name, detailText: detail.isEmpty ? nil : detail,
                                  image: CarPlayImages.sessionIcon(colorKey: session.colorKey, scale: carScale))
            item.handler = { [weak self] _, completion in
                self?.choose(session)
                completion()
            }
            return item
        }
        let list = CPListTemplate(title: "Care Sessions", sections: [CPListSection(items: items)])
        interfaceController.pushTemplate(list, animated: true) { _, _ in }  // a refusal without one throws
    }

    private func choose(_ session: SessionResponse) {
        AuthManager.shared.recordActivity()
        if session.id != sessionVM.currentSession?.id {
            sessionVM.switchSession(to: session)
        }
        updateLanding()
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
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.prepareTimeoutSeconds))
            guard let self, self.preparing == token else { return }
            self.startTask?.cancel()  // every await in the checks is followed by a cancel check
            self.preparing = nil
            self.showAlert("AretaCare can't connect right now. Try again in a moment.")
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
                      ? TalkViewModel.signedOutInCar
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
            updateLanding()
        }
        guard let sessionId = sessionVM.currentSession?.id else {
            showAlert(sessionVM.errorMessage == nil
                      ? TalkViewModel.noCareSessionInCar
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
        let traits = interfaceController.carTraitCollection
        let screen = CarPlayCallScreen(talk: talk, scale: traits.displayScale, style: traits.userInterfaceStyle) {
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
        updateLanding()
        interfaceController.popToRootTemplate(animated: false, completion: nil)
        if wasInCall { showAlert(TalkViewModel.signedOutInCar) }
    }

    /// The voice screen went away while this coordinator still wanted it up and CarPlay no
    /// longer shows it: the driver closed it with the navigation bar button (Done, or the
    /// system's own close button if a car ignores Done). That ends the conversation. Leaving
    /// it running would hide its Mute and End. A switch to another CarPlay app also hides
    /// the screen, but it stays presented, so that call carries on.
    private func templateDidDisappear(_ template: CPTemplate) {
        guard let callScreen, callScreen.template === template, desiredModal === template,
              interfaceController.presentedTemplate !== template else { return }
        desiredModal = nil
        let talk = callScreen.talk
        if talk.isActive { Task { await talk.end() } }
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
        let change = UUID()
        modalChange = change
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.modalChangeTimeoutSeconds))
            guard let self, self.modalChange == change else { return }
            self.finishModalChange(change)
        }
        if shown != nil {
            interfaceController.dismissTemplate(animated: desiredModal == nil) { [weak self] _, _ in
                Task { @MainActor in self?.finishModalChange(change) }
            }
        } else if let desired = desiredModal {
            interfaceController.presentTemplate(desired, animated: true) { [weak self] presented, _ in
                Task { @MainActor in
                    guard let self else { return }
                    if !presented, self.desiredModal === desired {
                        self.desiredModal = nil  // don't retry a template CarPlay refused
                        // A refused voice screen is rebuilt on the next tap, not kept unseen.
                        if let callScreen = self.callScreen, callScreen.template === desired {
                            callScreen.detach()
                            self.callScreen = nil
                            // A call started here would have an open microphone and no Mute or
                            // End: end it. One started on the phone has its own there.
                            let talk = callScreen.talk
                            if talk.surface == .carPlay, talk.isActive { Task { await talk.end() } }
                        }
                    }
                    if presented, let callScreen = self.callScreen, callScreen.template === desired {
                        callScreen.didAppear()
                    }
                    self.finishModalChange(change)
                }
            }
        } else {
            isChangingModal = false
            modalChange = nil
        }
    }

    /// A present or dismiss finished (or timed out): the next one may go. A late completion
    /// from a change that already timed out is ignored.
    private func finishModalChange(_ change: UUID) {
        guard modalChange == change else { return }
        modalChange = nil
        isChangingModal = false
        reconcileModal()
    }

    /// A short message with OK. Wording rule: say what's wrong, never tell the driver to use
    /// the phone. `shorter` is used where the car's screen has less room.
    private func showAlert(_ message: String, shorter: String? = nil) {
        guard isConnected else { return }
        weak var shownAlert: CPAlertTemplate?
        let ok = CPAlertAction(title: "OK", style: .cancel) { [weak self] _ in
            guard let self else { return }
            // Only this alert's OK: a late tap mustn't take down a voice screen that has
            // replaced it. And a call that's live (one an alert covered) gets its screen back.
            if self.desiredModal == nil || self.desiredModal === shownAlert { self.setModal(nil) }
            self.showLiveCallIfAny()
        }
        let alert = CPAlertTemplate(titleVariants: [message] + (shorter.map { [$0] } ?? []), actions: [ok])
        shownAlert = alert
        setModal(alert)
    }
}

/// `CPInterfaceControllerDelegate` needs an NSObject; the coordinator isn't one.
@available(iOS 26.4, *)
@MainActor
private final class TemplateEvents: NSObject, CPInterfaceControllerDelegate {
    var didAppear: ((CPTemplate) -> Void)?
    var didDisappear: ((CPTemplate) -> Void)?

    func templateDidAppear(_ aTemplate: CPTemplate, animated: Bool) {
        didAppear?(aTemplate)
    }

    func templateDidDisappear(_ aTemplate: CPTemplate, animated: Bool) {
        didDisappear?(aTemplate)
    }
}
