import SwiftUI

extension View {
    /// Conditionally apply a modifier.
    ///
    ///     Text("Hello")
    ///         .if(isHighlighted) { $0.foregroundColor(.blue) }
    ///
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }

    /// Conditionally apply a modifier based on an optional value.
    ///
    ///     Text("Hello")
    ///         .ifLet(colorKey) { view, key in view.background(Color(key)) }
    ///
    @ViewBuilder
    func ifLet<T, Content: View>(_ value: T?, transform: (Self, T) -> Content) -> some View {
        if let value {
            transform(self, value)
        } else {
            self
        }
    }

    /// Apply a session background color if the key is set.
    @ViewBuilder
    func sessionBackground(colorKey: String?, colorScheme: ColorScheme) -> some View {
        if let color = SessionColors.backgroundColor(forKey: colorKey, colorScheme: colorScheme) {
            self.background(color)
        } else {
            self
        }
    }
}
