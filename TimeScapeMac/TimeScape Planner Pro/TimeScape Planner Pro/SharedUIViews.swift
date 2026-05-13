import SwiftUI
import AppKit
import MapKit
import Combine

// MARK: - Reusable Card Components

struct CardStyle: ViewModifier {
    var cornerRadius: CGFloat = 20
    var tint: Color = .clear
    var hasBorder: Bool = true

    func body(content: Content) -> some View {
        content
            .background(
                tint == .clear
                    ? AnyShapeStyle(.thinMaterial)
                    : AnyShapeStyle(tint.opacity(0.10)),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay(
                Group {
                    if hasBorder {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(
                                tint == .clear
                                    ? Color.primary.opacity(0.08)
                                    : tint.opacity(0.16),
                                lineWidth: 1
                            )
                    }
                }
            )
    }
}

extension View {
    func cardStyle(cornerRadius: CGFloat = 20, tint: Color = .clear, hasBorder: Bool = true) -> some View {
        modifier(CardStyle(cornerRadius: cornerRadius, tint: tint, hasBorder: hasBorder))
    }
}

struct CardView<Content: View>: View {
    var cornerRadius: CGFloat = 20
    var tint: Color = .clear
    var hasBorder: Bool = true
    var padding: CGFloat = 18
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .cardStyle(cornerRadius: cornerRadius, tint: tint, hasBorder: hasBorder)
    }
}

// MARK: - Feature Cards

    struct PlaceholderFeatureCard: View {
        let destination: AppDestination

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                Text("Coming soon")
                    .font(.headline)
                Text("\(destination.title) is part of the app plan, but it is not ready in this release yet. The current build focuses on the core planning experience, and this section will open once its workflow is ready.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardStyle(cornerRadius: 20, hasBorder: false)
        }
    }

    struct SectionHeader: View {
        let title: String
        let eyebrow: String

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow.uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .tracking(1.1)
                Text(title)
                    .font(.title.weight(.semibold))
            }
        }
    }

    struct MetricCard: View {
        let title: String
        let value: String
        let detail: String
        let tint: Color

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 144, alignment: .leading)
            .cardStyle(cornerRadius: 20, tint: tint, hasBorder: true)
        }
    }

    struct FeatureListCard: View {
        let title: String
        let items: [String]

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.headline)

                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(Color.accentColor.opacity(0.18))
                            .frame(width: 8, height: 8)
                            .padding(.top, 6)
                        Text(item)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 144, alignment: .leading)
            .cardStyle(cornerRadius: 20, hasBorder: false)
        }
    }

    struct AppStatusBadge: View {
        let status: CompanionAppStatus

        var body: some View {
            Text(status.label)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule(style: .continuous)
                        .fill(status.tint.opacity(0.14))
                )
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(status.tint.opacity(0.30), lineWidth: 1)
                )
                .foregroundStyle(status.tint)
        }
    }

    struct CompanionSubItemBadge: View {
        let kind: PlanningSubItemKind

        var body: some View {
            if let app = kind.companionAppID {
                ZStack {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [app.accentStart.opacity(0.88), app.accentEnd.opacity(0.70)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 20, height: 20)

                    Image(systemName: kind.symbolName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                }
            } else {
                // Fallback for companion kinds without an app yet (e.g. .outfit)
                Image(systemName: kind.symbolName)
                    .foregroundStyle(.secondary)
            }
        }
    }

    struct AppLauncherTile: View {
        let app: CompanionAppID
        let isSelected: Bool
        let isHovered: Bool
        let onSelect: () -> Void

        var body: some View {
            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 12) {
                    ZStack(alignment: .bottomTrailing) {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [app.accentStart.opacity(0.88), app.accentEnd.opacity(0.70)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )

                        Image(systemName: app.symbolName)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(16)
                    }
                    .frame(height: 110)

                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(app.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Spacer(minLength: 0)
                        AppStatusBadge(status: app.status)
                    }

                    Text(app.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.thinMaterial)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(borderColor, lineWidth: isSelected ? 1.6 : 1)
                )
                .shadow(color: shadowColor, radius: isHovered || isSelected ? 14 : 8, y: isHovered || isSelected ? 8 : 4)
                .scaleEffect(isHovered ? 1.01 : 1.0)
                .appAnimated(isHovered, animation: AppMotion.hover)
                .appAnimated(isSelected, animation: AppMotion.hover)
            }
            .buttonStyle(.plain)
        }

        private var borderColor: Color {
            if isSelected {
                return app.accentStart.opacity(0.42)
            }
            if isHovered {
                return Color.primary.opacity(0.22)
            }
            return Color.primary.opacity(0.12)
        }

        private var shadowColor: Color {
            if isSelected {
                return app.accentStart.opacity(0.20)
            }
            return Color.black.opacity(0.10)
        }
    }

    final class LocationAutocompleteModel: NSObject, ObservableObject {
        @Published var query: String = ""
        @Published private(set) var suggestions: [MKLocalSearchCompletion] = []
        @Published private(set) var isSearching = false

        private let completer = MKLocalSearchCompleter()
        private var cancellables: Set<AnyCancellable> = []

        override init() {
            super.init()
            completer.delegate = self
            completer.resultTypes = [.address, .pointOfInterest]

            $query
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .removeDuplicates()
                .debounce(for: .milliseconds(280), scheduler: RunLoop.main)
                .sink { [weak self] fragment in
                    guard let self else { return }
                    guard fragment.count >= 3 else {
                        self.suggestions = []
                        self.isSearching = false
                        self.completer.queryFragment = ""
                        return
                    }

                    self.isSearching = true
                    self.completer.queryFragment = fragment
                }
                .store(in: &cancellables)
        }

        func resetSuggestions() {
            suggestions = []
            isSearching = false
        }

        func apply(_ completion: MKLocalSearchCompletion) {
            let subtitle = completion.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if subtitle.isEmpty {
                query = completion.title
            } else {
                query = "\(completion.title), \(subtitle)"
            }
            resetSuggestions()
        }
    }

    extension LocationAutocompleteModel: MKLocalSearchCompleterDelegate {
        func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
            suggestions = completer.results
            isSearching = false
        }

        func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
            suggestions = []
            isSearching = false
        }
    }

    struct LocationAutocompleteField: View {
        @Binding var text: String
        let placeholder: String

        @StateObject private var autocomplete = LocationAutocompleteModel()
        @FocusState private var isFocused: Bool
        @State private var highlightedIndex: Int? = nil

        init(text: Binding<String>, placeholder: String = "Location") {
            self._text = text
            self.placeholder = placeholder
        }

        private var shouldShowSuggestions: Bool {
            isFocused && !autocomplete.suggestions.isEmpty
        }

        private func moveSelection(delta: Int, maxCount: Int) {
            guard maxCount > 0 else {
                highlightedIndex = nil
                return
            }

            guard let current = highlightedIndex else {
                highlightedIndex = delta > 0 ? 0 : maxCount - 1
                return
            }

            let next = current + delta
            if next < 0 {
                highlightedIndex = maxCount - 1
            } else if next >= maxCount {
                highlightedIndex = 0
            } else {
                highlightedIndex = next
            }
        }

        private func applyHighlightedSuggestion(from suggestions: [MKLocalSearchCompletion]) {
            guard let highlightedIndex, suggestions.indices.contains(highlightedIndex) else { return }
            autocomplete.apply(suggestions[highlightedIndex])
            text = autocomplete.query
            self.highlightedIndex = nil
            isFocused = false
        }

        private func clearSuggestionsAndSelection() {
            highlightedIndex = nil
            autocomplete.resetSuggestions()
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 6) {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.roundedBorder)
                    .focused($isFocused)
                    .onChange(of: text) { _, newValue in
                        autocomplete.query = newValue
                        highlightedIndex = nil
                    }
                    .onSubmit {
                        clearSuggestionsAndSelection()
                    }
                    .onAppear {
                        autocomplete.query = text
                    }

                if autocomplete.isSearching && text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 {
                    Text("Searching places...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if shouldShowSuggestions {
                    let limitedSuggestions = Array(autocomplete.suggestions.prefix(6))

                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(limitedSuggestions.enumerated()), id: \.offset) { index, completion in
                            Button {
                                autocomplete.apply(completion)
                                text = autocomplete.query
                                highlightedIndex = nil
                                isFocused = false
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(completion.title)
                                        .font(.subheadline)
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)

                                    if !completion.subtitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(completion.subtitle)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .fill(highlightedIndex == index ? Color.accentColor.opacity(0.18) : .clear)
                                )
                            }
                            .buttonStyle(.plain)
                            .onHover { isHovering in
                                if isHovering {
                                    highlightedIndex = index
                                }
                            }

                            if index < limitedSuggestions.count - 1 {
                                Divider()
                            }
                        }
                    }
                    .cardStyle(cornerRadius: 10, hasBorder: true)
                }
            }
            .onChange(of: isFocused) { _, focused in
                if !focused {
                    clearSuggestionsAndSelection()
                }
            }
            .onChange(of: autocomplete.suggestions.count) { _, count in
                if count == 0 {
                    highlightedIndex = nil
                } else if let highlightedIndex, highlightedIndex >= count {
                    self.highlightedIndex = max(0, count - 1)
                }
            }
            .onCommand(#selector(NSResponder.moveDown(_:))) {
                guard shouldShowSuggestions else { return }
                let maxCount = min(autocomplete.suggestions.count, 6)
                moveSelection(delta: 1, maxCount: maxCount)
            }
            .onCommand(#selector(NSResponder.moveUp(_:))) {
                guard shouldShowSuggestions else { return }
                let maxCount = min(autocomplete.suggestions.count, 6)
                moveSelection(delta: -1, maxCount: maxCount)
            }
            .onCommand(#selector(NSResponder.insertNewline(_:))) {
                guard shouldShowSuggestions else { return }
                let limitedSuggestions = Array(autocomplete.suggestions.prefix(6))
                applyHighlightedSuggestion(from: limitedSuggestions)
            }
            .onCommand(#selector(NSResponder.cancelOperation(_:))) {
                guard shouldShowSuggestions else { return }
                clearSuggestionsAndSelection()
            }
        }
    }


    enum MicroFeedback {
        static func tap() {
            NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        }
    }

    extension Color {
        init(hex: String) {
            let raw = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
            var int: UInt64 = 0
            Scanner(string: raw).scanHexInt64(&int)

            let r: UInt64
            let g: UInt64
            let b: UInt64

            switch raw.count {
            case 3:
                (r, g, b) = ((int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
            case 6:
                (r, g, b) = (int >> 16, int >> 8 & 0xFF, int & 0xFF)
            default:
                (r, g, b) = (59, 130, 246)
            }

            self.init(
                .sRGB,
                red: Double(r) / 255,
                green: Double(g) / 255,
                blue: Double(b) / 255,
                opacity: 1
            )
        }
    }
