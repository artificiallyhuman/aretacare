import Foundation

/// A coding key for field names that are only known at runtime.
struct AnyCodingKey: CodingKey, Hashable {
    let stringValue: String
    let intValue: Int? = nil

    init(_ stringValue: String) { self.stringValue = stringValue }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

/// A model that keeps every JSON field the server sent but this build does not
/// declare, so a decode → edit → encode round-trip returns them unchanged.
///
/// Health Profile sections are saved back whole (`PATCH /profile/{id}/section`
/// replaces the array), so a struct that silently dropped unknown keys would
/// delete that data on the server the next time the user saved the section from
/// iOS — which is exactly what happens whenever the backend schema gains a field
/// before the app does. Conformers implement `init(from:)` / `encode(to:)` with
/// the two helpers below; keep those conformances in an extension so the
/// synthesized memberwise initialiser survives.
protocol UnknownFieldsPreserving {
    var additionalFields: [String: AnyCodableValue] { get set }
}

extension Decoder {
    /// Every key in this container that is not one of `known`.
    ///
    /// Keys arrive already transformed by the decoder's `keyDecodingStrategy`
    /// (`contact_info` → `contactInfo` under `.convertFromSnakeCase`); encoding
    /// with the matching `.convertToSnakeCase` turns them back.
    func decodeUnknownFields<Known: CodingKey & CaseIterable>(
        excluding known: Known.Type
    ) throws -> [String: AnyCodableValue] {
        let knownNames = Set(known.allCases.map(\.stringValue))
        let container = try self.container(keyedBy: AnyCodingKey.self)
        var fields: [String: AnyCodableValue] = [:]
        for key in container.allKeys where !knownNames.contains(key.stringValue) {
            fields[key.stringValue] = try container.decode(AnyCodableValue.self, forKey: key)
        }
        return fields
    }
}

extension Encoder {
    /// Writes `fields` into the same keyed container the declared fields use.
    func encodeUnknownFields(_ fields: [String: AnyCodableValue]) throws {
        guard !fields.isEmpty else { return }
        var container = self.container(keyedBy: AnyCodingKey.self)
        for (name, value) in fields {
            try container.encode(value, forKey: AnyCodingKey(name))
        }
    }
}
