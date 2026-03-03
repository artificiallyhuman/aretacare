import Foundation
import RevenueCat

@Observable @MainActor
final class SubscriptionManager {
    static let shared = SubscriptionManager()

    private(set) var isProUser = false
    private(set) var isCheckingEntitlement = true
    private(set) var customerInfo: CustomerInfo?
    private(set) var offerings: Offerings?
    private(set) var isLoading = false
    var errorMessage: String?

    private init() {}

    // MARK: - Configuration

    func configure() {
        #if DEBUG
        Purchases.logLevel = .debug
        #else
        Purchases.logLevel = .warn
        #endif
        Purchases.configure(withAPIKey: AppConstants.revenueCatAPIKey)
        Purchases.shared.delegate = RevenueCatDelegateHandler.shared
    }

    // MARK: - Identity

    func login(appUserID: String) async {
        isCheckingEntitlement = true
        do {
            let (customerInfo, _) = try await Purchases.shared.logIn(appUserID)
            updateEntitlements(from: customerInfo)
        } catch {
            #if DEBUG
            print("[Subscription] Login failed: \(error)")
            #endif
        }
        isCheckingEntitlement = false
    }

    func logout() async {
        isCheckingEntitlement = true
        do {
            let customerInfo = try await Purchases.shared.logOut()
            updateEntitlements(from: customerInfo)
        } catch {
            #if DEBUG
            print("[Subscription] Logout failed: \(error)")
            #endif
        }
    }

    // MARK: - Offerings

    func fetchOfferings() async {
        isLoading = true
        defer { isLoading = false }

        do {
            offerings = try await Purchases.shared.offerings()
        } catch {
            errorMessage = "Unable to load subscription options."
            #if DEBUG
            print("[Subscription] Fetch offerings failed: \(error)")
            #endif
        }
    }

    // MARK: - Customer Info

    func refreshCustomerInfo() async {
        do {
            let info = try await Purchases.shared.customerInfo()
            updateEntitlements(from: info)
        } catch {
            #if DEBUG
            print("[Subscription] Refresh customer info failed: \(error)")
            #endif
        }
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let info = try await Purchases.shared.restorePurchases()
            updateEntitlements(from: info)
        } catch {
            errorMessage = "Unable to restore purchases. Please try again."
            #if DEBUG
            print("[Subscription] Restore purchases failed: \(error)")
            #endif
        }
    }

    // MARK: - Entitlements

    func updateEntitlements(from info: CustomerInfo) {
        customerInfo = info
        isProUser = info.entitlements[AppConstants.entitlementID]?.isActive == true
    }

    /// Whether the user is currently in a free trial period.
    var isInFreeTrial: Bool {
        guard let entitlement = customerInfo?.entitlements[AppConstants.entitlementID] else {
            return false
        }
        return entitlement.periodType == .trial
    }

    /// Current subscription plan description based on active entitlement.
    var currentPlanDescription: String {
        guard isProUser,
              let entitlement = customerInfo?.entitlements[AppConstants.entitlementID],
              entitlement.isActive else {
            return "Free"
        }

        let planName: String
        if let productID = entitlement.productIdentifier as String? {
            if productID.contains(AppConstants.monthlyProductID) {
                planName = "Monthly"
            } else if productID.contains(AppConstants.yearlyProductID) {
                planName = "Yearly"
            } else {
                planName = "Active"
            }
        } else {
            planName = "Active"
        }

        if isInFreeTrial {
            return "\(planName) (Trial)"
        }
        return planName
    }

    /// Expiration date of the current subscription, if any.
    var expirationDate: Date? {
        customerInfo?.entitlements[AppConstants.entitlementID]?.expirationDate
    }

    /// Whether the subscription will renew.
    var willRenew: Bool {
        guard let entitlement = customerInfo?.entitlements[AppConstants.entitlementID] else {
            return false
        }
        return entitlement.willRenew
    }
}

// MARK: - RevenueCat Delegate

/// Handles RevenueCat delegate callbacks and forwards updates to SubscriptionManager.
/// Must be non-isolated to conform to `PurchasesDelegate`.
final class RevenueCatDelegateHandler: NSObject, PurchasesDelegate, Sendable {
    static let shared = RevenueCatDelegateHandler()

    nonisolated func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        Task { @MainActor in
            SubscriptionManager.shared.updateEntitlements(from: customerInfo)
        }
    }
}
