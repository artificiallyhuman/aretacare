import SwiftUI

struct UploadingOverlay: View {
    // Simple mode (backward compatible)
    var message: String = "Uploading..."

    // Batch mode (optional — all nil by default for backward compatibility)
    var fileProgress: [UploadFileProgress]?
    var currentIndex: Int?
    var totalCount: Int?
    var onCancel: (() -> Void)?

    var body: some View {
        ZStack {
            Color.black.opacity(0.3).ignoresSafeArea()

            if let fileProgress, let currentIndex, let totalCount, totalCount > 1 {
                batchProgressView(fileProgress: fileProgress, currentIndex: currentIndex, totalCount: totalCount)
            } else {
                simpleProgressView
            }
        }
    }

    // MARK: - Simple Mode

    private var simpleProgressView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
            Text(message)
                .font(.subheadline.weight(.medium))
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Upload in progress")
    }

    // MARK: - Batch Mode

    private func batchProgressView(fileProgress: [UploadFileProgress], currentIndex: Int, totalCount: Int) -> some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Uploading Files")
                        .font(.headline)
                    Text("File \(min(currentIndex + 1, totalCount)) of \(totalCount)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let onCancel {
                    Button("Cancel", role: .destructive) {
                        onCancel()
                    }
                    .font(.subheadline)
                }
            }

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(fileProgress) { file in
                        fileRow(file)
                    }
                }
            }
            .frame(maxHeight: 240)
        }
        .padding(20)
        .frame(maxWidth: 320)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func fileRow(_ file: UploadFileProgress) -> some View {
        HStack(spacing: 8) {
            statusIcon(for: file.status)
                .frame(width: 16)

            Text(file.filename)
                .font(.caption)
                .lineLimit(1)
                .truncationMode(.middle)

            Spacer()

            Text(statusLabel(for: file.status))
                .font(.caption2)
                .foregroundStyle(statusColor(for: file.status))
        }
    }

    private func statusIcon(for status: UploadFileStatus) -> some View {
        Group {
            switch status {
            case .pending:
                Image(systemName: "clock")
                    .foregroundStyle(.secondary)
            case .uploading:
                ProgressView()
                    .controlSize(.mini)
            case .success:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .error:
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
            case .cancelled:
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(.secondary)
            }
        }
        .font(.caption)
    }

    private func statusLabel(for status: UploadFileStatus) -> String {
        switch status {
        case .pending: return "Waiting..."
        case .uploading: return "Uploading..."
        case .success: return "Complete"
        case .error(let msg): return msg
        case .cancelled: return "Cancelled"
        }
    }

    private func statusColor(for status: UploadFileStatus) -> Color {
        switch status {
        case .pending: return .secondary
        case .uploading: return Color.accentColor
        case .success: return .green
        case .error: return .red
        case .cancelled: return .secondary
        }
    }
}
