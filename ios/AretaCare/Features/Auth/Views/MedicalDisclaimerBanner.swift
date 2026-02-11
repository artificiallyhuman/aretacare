import SwiftUI

struct MedicalDisclaimerBanner: View {
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.body)

            VStack(alignment: .leading, spacing: 4) {
                Text("Important")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)

                Text("AretaCare is an AI assistant and does not provide medical advice, diagnosis, or treatment. Consult qualified healthcare professionals for medical decisions. This is a consumer tool, not a HIPAA-covered service or medical record system.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.orange.opacity(0.08))
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.orange)
                .frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

#Preview {
    MedicalDisclaimerBanner()
        .padding()
}
