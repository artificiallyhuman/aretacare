import CarPlay
import Sentry
import UIKit

/// Runs AretaCare on the CarPlay screen.
///
/// Landing screen: a list titled AretaCare with four one-tap starts (Talk, Catch me up,
/// Before a visit, After a visit) and, under a "Care session" header, one row naming the
/// care session; with more than one, tapping it opens the list of care sessions. On a wide
/// screen the starts are round buttons pinned along the top; on any other (Subaru's portrait
/// screen, which leaves the app about a square) they're rows, which fill the screen instead
/// of leaving most of it empty. A start opens the voice screen and starts a Talk call. Apple's
/// rules for the category (CarPlay Developer Guide, Oct 2026): voice first, no text or
/// images in answers, at most three templates deep, the microphone only with the voice
/// control template, and never a message telling the driver to pick up the phone.
@available(iOS 26.4, *)
@MainActor
final class CarPlayCoordinator {
    private let interfaceController: CPInterfaceController
    /// The scene's window, for the screen's shape.
    private weak var carWindow: CPWindow?
    /// The starts are list rows (a screen that isn't clearly wide) rather than round buttons
    /// pinned along the top.
    private var startsAsRows = false
    private var recordedScreenSize: CGSize?
    private var sessionVM = SessionViewModel()
    private var landing: CPListTemplate?
    /// Built once: the start rows don't change, and the landing list is re-sent whenever the
    /// care session row does.
    private lazy var startSection = makeStartSection()
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
    /// The first load (sign-in restore included) has finished. Until then the care session
    /// row says Loading: on a cold start in the car, sign-in is still being restored.
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

    init(interfaceController: CPInterfaceController, carWindow: CPWindow) {
        self.interfaceController = interfaceController
        self.carWindow = carWindow
    }

    // MARK: - Connection

    func connect() {
        isConnected = true
        templateEvents.didDisappear = { [weak self] template in self?.templateDidDisappear(template) }
        templateEvents.didAppear = { [weak self] template in
            guard let self else { return }
            if template === self.landing {
                self.applyScreenShape()
            } else if let callScreen = self.callScreen, callScreen.template === template {
                // Back from another CarPlay app: bring the voice screen up to date.
                callScreen.didAppear()
            }
        }
        interfaceController.delegate = templateEvents
        let landing = makeLanding()
        self.landing = landing
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

    private func makeLanding() -> CPListTemplate {
        startsAsRows = screenWantsRows() ?? false
        return CPListTemplate(title: "AretaCare", sections: landingSections(), assistantCellConfiguration: nil,
                              headerGridButtons: startsAsRows ? nil : startButtons())
    }

    private func landingSections() -> [CPListSection] {
        startsAsRows ? [startSection, sessionSection()] : [sessionSection()]
    }

    /// Round buttons along the top suit a wide screen (Sony's 800 × 480). Anything less wide
    /// gets rows, which fill the screen instead of leaving most of it empty. Subaru's portrait
    /// screen gives the app about a square (the dock takes the bottom), so the first test,
    /// "taller than wide", missed it.
    private static let wideAspectRatio: CGFloat = 1.3

    /// Whether the car's screen calls for rows, or nil while its size isn't known (the window
    /// may not be laid out yet at connect; the landing screen asks again when it appears and
    /// on every update).
    private func screenWantsRows() -> Bool? {
        guard let window = carWindow else { return nil }
        var size = window.bounds.size
        // A window not laid out yet: the car's own screen. (A window's screen defaults to the
        // phone's, which is portrait, so only the CarPlay screen counts.)
        if size.width < 1 || size.height < 1, window.screen.traitCollection.userInterfaceIdiom == .carPlay {
            size = window.screen.bounds.size
        }
        guard size.width >= 1, size.height >= 1 else { return nil }
        let rows = size.width < size.height * Self.wideAspectRatio
        recordScreen(size, rows: rows)
        return rows
    }

    /// The car's screen size and the layout picked, in the breadcrumbs of any later Sentry
    /// event: car screens can only be measured in the car. Once per distinct size.
    private func recordScreen(_ size: CGSize, rows: Bool) {
        guard size != recordedScreenSize else { return }
        recordedScreenSize = size
        let crumb = Breadcrumb(level: .info, category: "carplay")
        crumb.message = "CarPlay screen \(Int(size.width))×\(Int(size.height)) pt: \(rows ? "rows" : "buttons")"
        SentrySDK.addBreadcrumb(crumb)
    }

    /// The four one-tap starts. Titles list a shorter variant for narrow buttons.
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

    /// Wide screens: round colored tiles pinned above the list.
    private func startButtons() -> [CPGridButton] {
        Self.starts.map { start in
            let image = CarPlayImages.startTile(start.symbol, colors: start.colors, scale: carScale)
            return CPGridButton(titleVariants: start.titles, image: image) { [weak self] _ in
                self?.startCall(opening: start.opening)
            }
        }
    }

    /// Tall screens: one row per start, with the same colored icon.
    private func makeStartSection() -> CPListSection {
        let items = Self.starts.map { start in
            let item = CPListItem(text: start.titles[0], detailText: nil,
                                  image: CarPlayImages.startRowIcon(start.symbol, colors: start.colors, scale: carScale))
            item.handler = { [weak self] _, completion in
                self?.startCall(opening: start.opening)
                completion()
            }
            return item
        }
        return CPListSection(items: items)
    }

    /// "Care session" and the care session's name, so the name says what it is. With more
    /// than one care session the row opens the list to switch.
    private func sessionSection() -> CPListSection {
        let item: CPListItem
        if !hasLoadedOnce {
            item = CPListItem(text: "Loading…", detailText: nil)
        } else if !AuthManager.shared.isAuthenticated {
            item = CPListItem(text: "Not signed in", detailText: nil)
        } else if let session = sessionVM.currentSession {
            let canSwitch = sessionVM.sessions.count > 1
            item = CPListItem(text: session.name, detailText: canSwitch ? "Tap to switch" : nil,
                              image: CarPlayImages.sessionIcon(colorKey: session.colorKey, scale: carScale),
                              accessoryImage: nil, accessoryType: canSwitch ? .disclosureIndicator : .none)
        } else if sessionVM.errorMessage != nil {
            item = CPListItem(text: "Couldn't load your care sessions", detailText: nil)
        } else {
            item = CPListItem(text: isLoadingSessions ? "Loading…" : "No care session yet", detailText: nil)
        }
        item.handler = { [weak self] _, completion in
            if let self, self.sessionVM.sessions.count > 1, self.sessionVM.currentSession != nil {
                self.showSessionPicker()
            }
            completion()
        }
        return CPListSection(items: [item], header: "Care session", sectionIndexTitle: nil)
    }

    private func updateLanding() {
        if !applyScreenShape() { landing?.updateSections(landingSections()) }
    }

    /// Measures the screen again and, if the layout should change, switches between rows and
    /// pinned buttons. Cheap when nothing changed (the landing screen calls it each time it
    /// appears): nothing is sent to the car. Returns whether it switched.
    @discardableResult
    private func applyScreenShape() -> Bool {
        guard let landing, let rows = screenWantsRows(), rows != startsAsRows else { return false }
        startsAsRows = rows
        landing.headerGridButtons = rows ? nil : startButtons()
        landing.updateSections(landingSections())
        return true
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
            let item = CPListItem(text: session.name, detailText: session.id == currentId ? "Current" : nil,
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
            updateLanding()
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
        if wasInCall { showAlert("You're signed out of AretaCare.") }
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
