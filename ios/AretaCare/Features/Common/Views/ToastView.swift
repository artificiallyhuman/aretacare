import SwiftUI
import UIKit

struct ToastModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var isPresented: Bool
    let message: String
    let icon: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if isPresented {
                    HStack(spacing: 6) {
                        if let icon {
                            Image(systemName: icon)
                                .font(.subheadline.weight(.medium))
                                .accessibilityHidden(true)
                        }
                        Text(message)
                            .font(.subheadline.weight(.medium))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.black.opacity(0.75)))
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .padding(.top, 8)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(message)
                    .onAppear {
                        UIAccessibility.post(notification: .announcement, argument: message)
                        Task {
                            try? await Task.sleep(for: .seconds(1.5))
                            withAnimation(.easeOut(duration: 0.3)) {
                                isPresented = false
                            }
                        }
                    }
                }
            }
    }
}

extension View {
    func toast(_ message: String, icon: String? = nil, isPresented: Binding<Bool>) -> some View {
        modifier(ToastModifier(isPresented: isPresented, message: message, icon: icon))
    }
}
