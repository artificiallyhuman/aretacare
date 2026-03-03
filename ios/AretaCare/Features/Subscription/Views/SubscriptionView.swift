import SwiftUI
import RevenueCatUI

struct SubscriptionView: View {
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var showCustomerCenter = false
    @State private var isRestoring = false

    var body: some View {
        Form {
            currentPlanSection
            subscriptionDetailsSection
            manageSection
            restoreSection
        }
        .navigationTitle("Subscription")
        .task {
            await subscriptionManager.refreshCustomerInfo()
        }
        .sheet(isPresented: $showCustomerCenter) {
            CustomerCenterSheet()
        }
        .overlay(alignment: .top) {
            if let error = subscriptionManager.errorMessage {
                ErrorBannerView(message: error) {
                    subscriptionManager.errorMessage = nil
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Current Plan

    private var currentPlanSection: some View {
        Section {
            HStack {
                Label("Plan", systemImage: "creditcard")
                Spacer()
                Text(subscriptionManager.currentPlanDescription)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Label("Status", systemImage: subscriptionManager.isInFreeTrial ? "clock" : "checkmark.circle")
                Spacer()
                Text(subscriptionManager.isInFreeTrial ? "Free Trial" : "Active")
                    .foregroundStyle(subscriptionManager.isInFreeTrial ? .orange : .green)
            }
        } header: {
            Text("Current Plan")
        } footer: {
            if subscriptionManager.isInFreeTrial {
                if let expiration = subscriptionManager.expirationDate {
                    Text("Your free trial ends on \(expiration.formatted(date: .abbreviated, time: .omitted)). You'll be charged automatically unless you cancel before then.")
                }
            }
        }
    }

    // MARK: - Subscription Details

    private var subscriptionDetailsSection: some View {
        Section("Details") {
            if let expiration = subscriptionManager.expirationDate {
                HStack {
                    Label(subscriptionManager.willRenew ? "Renews" : "Expires", systemImage: "calendar")
                    Spacer()
                    Text(expiration, style: .date)
                        .foregroundStyle(.secondary)
                }
            }

            if !subscriptionManager.willRenew {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("Your subscription will not renew.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Manage

    private var manageSection: some View {
        Section {
            Button {
                showCustomerCenter = true
            } label: {
                HStack {
                    Label("Change Plan or Cancel", systemImage: "arrow.triangle.2.circlepath")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .tint(.primary)
        } footer: {
            Text("Switch between monthly and yearly, or manage your subscription.")
        }
    }

    // MARK: - Restore

    private var restoreSection: some View {
        Section {
            Button {
                Task {
                    isRestoring = true
                    await subscriptionManager.restorePurchases()
                    isRestoring = false
                }
            } label: {
                HStack {
                    Label("Restore Purchases", systemImage: "arrow.clockwise")
                    Spacer()
                    if isRestoring {
                        ProgressView()
                    }
                }
            }
            .tint(.primary)
            .disabled(isRestoring)
        } footer: {
            Text("Restore a previous purchase made with your Apple ID.")
        }
    }
}

#Preview {
    NavigationStack {
        SubscriptionView()
    }
}
