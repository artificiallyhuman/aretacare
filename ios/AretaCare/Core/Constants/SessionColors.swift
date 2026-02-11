import SwiftUI

// MARK: - Session Background Colors

/// 15 distinct subtle background colors matching the web app's sessionColors.js.
/// Light mode uses very low opacity tints; dark mode uses -500 shades at 15% opacity.
struct SessionColor: Identifiable {
    let id: String // key used in API (e.g., "slate")
    let label: String
    let light: Color
    let dark: Color
    let swatchLight: Color
    let swatchDark: Color

    /// Returns the appropriate background color for the current color scheme.
    func background(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? dark : light
    }

    /// Returns the appropriate swatch color for the current color scheme.
    func swatch(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? swatchDark : swatchLight
    }
}

enum SessionColors {
    static let all: [SessionColor] = [
        SessionColor(id: "slate",   label: "Slate",   light: Color(.sRGB, red: 0.97, green: 0.98, blue: 0.98, opacity: 1), dark: Color(.sRGB, red: 0.39, green: 0.45, blue: 0.53, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.79, green: 0.83, blue: 0.87, opacity: 1), swatchDark: Color(.sRGB, red: 0.28, green: 0.33, blue: 0.41, opacity: 1)),
        SessionColor(id: "sky",     label: "Sky",     light: Color(.sRGB, red: 0.94, green: 0.98, blue: 1.0, opacity: 1), dark: Color(.sRGB, red: 0.05, green: 0.65, blue: 0.92, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.73, green: 0.90, blue: 0.97, opacity: 1), swatchDark: Color(.sRGB, red: 0.01, green: 0.46, blue: 0.68, opacity: 1)),
        SessionColor(id: "teal",    label: "Teal",    light: Color(.sRGB, red: 0.94, green: 0.99, blue: 0.98, opacity: 1), dark: Color(.sRGB, red: 0.08, green: 0.71, blue: 0.67, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.60, green: 0.89, blue: 0.86, opacity: 1), swatchDark: Color(.sRGB, red: 0.05, green: 0.50, blue: 0.47, opacity: 1)),
        SessionColor(id: "green",   label: "Green",   light: Color(.sRGB, red: 0.94, green: 0.99, blue: 0.95, opacity: 1), dark: Color(.sRGB, red: 0.13, green: 0.72, blue: 0.36, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.65, green: 0.90, blue: 0.71, opacity: 1), swatchDark: Color(.sRGB, red: 0.08, green: 0.50, blue: 0.25, opacity: 1)),
        SessionColor(id: "lime",    label: "Lime",    light: Color(.sRGB, red: 0.97, green: 1.0, blue: 0.94, opacity: 1), dark: Color(.sRGB, red: 0.52, green: 0.80, blue: 0.09, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.74, green: 0.93, blue: 0.54, opacity: 1), swatchDark: Color(.sRGB, red: 0.30, green: 0.56, blue: 0.02, opacity: 1)),
        SessionColor(id: "blue",    label: "Blue",    light: Color(.sRGB, red: 0.94, green: 0.96, blue: 1.0, opacity: 1), dark: Color(.sRGB, red: 0.23, green: 0.51, blue: 0.96, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.74, green: 0.83, blue: 0.97, opacity: 1), swatchDark: Color(.sRGB, red: 0.11, green: 0.37, blue: 0.80, opacity: 1)),
        SessionColor(id: "indigo",  label: "Indigo",  light: Color(.sRGB, red: 0.93, green: 0.95, blue: 1.0, opacity: 1), dark: Color(.sRGB, red: 0.39, green: 0.40, blue: 0.95, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.76, green: 0.78, blue: 0.96, opacity: 1), swatchDark: Color(.sRGB, red: 0.26, green: 0.27, blue: 0.73, opacity: 1)),
        SessionColor(id: "purple",  label: "Purple",  light: Color(.sRGB, red: 0.98, green: 0.95, blue: 1.0, opacity: 1), dark: Color(.sRGB, red: 0.66, green: 0.33, blue: 0.97, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.90, green: 0.77, blue: 0.98, opacity: 1), swatchDark: Color(.sRGB, red: 0.49, green: 0.22, blue: 0.73, opacity: 1)),
        SessionColor(id: "zinc",    label: "Zinc",    light: Color(.sRGB, red: 0.96, green: 0.96, blue: 0.96, opacity: 1), dark: Color(.sRGB, red: 0.44, green: 0.44, blue: 0.46, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.83, green: 0.83, blue: 0.85, opacity: 1), swatchDark: Color(.sRGB, red: 0.32, green: 0.32, blue: 0.34, opacity: 1)),
        SessionColor(id: "rose",    label: "Rose",    light: Color(.sRGB, red: 1.0, green: 0.95, blue: 0.96, opacity: 1), dark: Color(.sRGB, red: 0.96, green: 0.33, blue: 0.47, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.99, green: 0.76, blue: 0.82, opacity: 1), swatchDark: Color(.sRGB, red: 0.74, green: 0.17, blue: 0.33, opacity: 1)),
        SessionColor(id: "pink",    label: "Pink",    light: Color(.sRGB, red: 0.99, green: 0.95, blue: 0.97, opacity: 1), dark: Color(.sRGB, red: 0.93, green: 0.29, blue: 0.59, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.98, green: 0.73, blue: 0.85, opacity: 1), swatchDark: Color(.sRGB, red: 0.70, green: 0.15, blue: 0.42, opacity: 1)),
        SessionColor(id: "fuchsia", label: "Fuchsia", light: Color(.sRGB, red: 0.99, green: 0.95, blue: 1.0, opacity: 1), dark: Color(.sRGB, red: 0.85, green: 0.27, blue: 0.94, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.96, green: 0.72, blue: 0.98, opacity: 1), swatchDark: Color(.sRGB, red: 0.63, green: 0.13, blue: 0.73, opacity: 1)),
        SessionColor(id: "yellow",  label: "Yellow",  light: Color(.sRGB, red: 1.0, green: 0.99, blue: 0.94, opacity: 1), dark: Color(.sRGB, red: 0.92, green: 0.77, blue: 0.12, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.99, green: 0.93, blue: 0.54, opacity: 1), swatchDark: Color(.sRGB, red: 0.63, green: 0.53, blue: 0.03, opacity: 1)),
        SessionColor(id: "orange",  label: "Orange",  light: Color(.sRGB, red: 1.0, green: 0.97, blue: 0.93, opacity: 1), dark: Color(.sRGB, red: 0.98, green: 0.57, blue: 0.12, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.99, green: 0.85, blue: 0.64, opacity: 1), swatchDark: Color(.sRGB, red: 0.76, green: 0.35, blue: 0.02, opacity: 1)),
        SessionColor(id: "red",     label: "Red",     light: Color(.sRGB, red: 1.0, green: 0.95, blue: 0.95, opacity: 1), dark: Color(.sRGB, red: 0.94, green: 0.27, blue: 0.27, opacity: 0.15), swatchLight: Color(.sRGB, red: 0.99, green: 0.73, blue: 0.73, opacity: 1), swatchDark: Color(.sRGB, red: 0.72, green: 0.11, blue: 0.11, opacity: 1)),
    ]

    /// Look up a session color by its API key. Returns nil if not found.
    static func color(forKey key: String?) -> SessionColor? {
        guard let key else { return nil }
        return all.first { $0.id == key }
    }

    /// Get the background Color for a given key and color scheme.
    static func backgroundColor(forKey key: String?, colorScheme: ColorScheme) -> Color? {
        color(forKey: key)?.background(for: colorScheme)
    }
}
