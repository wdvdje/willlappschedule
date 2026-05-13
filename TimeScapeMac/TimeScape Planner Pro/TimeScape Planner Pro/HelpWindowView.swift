import SwiftUI

struct HelpWindowView: View {
    @EnvironmentObject private var helpStore: HelpStore
    @State private var searchText = ""
    @State private var selectedResult: HelpStore.SearchResult?
    @State private var selectedTopicID: String?

    private var searchResults: [HelpStore.SearchResult] {
        helpStore.search(query: searchText)
    }

    private var displayResults: [HelpStore.SearchResult] {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : searchResults
    }

    private var selectedTopicForDisplay: HelpTopic? {
        if let selectedResult {
            return selectedResult.topic
        }
        if let selectedTopicID {
            return helpStore.topic(withID: selectedTopicID)
        }
        return displayResults.first?.topic
    }

    private var selectedSectionForDisplay: HelpSection? {
        if let topic = selectedTopicForDisplay {
            return helpStore.section(containingTopicID: topic.id)
        }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 12) {
                Text("Help")
                    .font(.title.weight(.semibold))

                TextField("Search help topics...", text: $searchText)
                    .textFieldStyle(.roundedBorder)
                    .frame(height: 36)
            }
            .padding(16)
            .background(Color(nsColor: .controlBackgroundColor))
            .border(Color.gray.opacity(0.2), width: 1)

            if helpStore.isLoading {
                VStack {
                    ProgressView()
                        .progressViewStyle(.circular)
                    Text("Loading help content...")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
            } else if let error = helpStore.error {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Error loading help")
                        .font(.headline)
                        .foregroundStyle(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(Color(nsColor: .windowBackgroundColor))
            } else {
                HSplitView {
                    searchResultsPanel
                        .frame(minWidth: 280, idealWidth: 340, maxWidth: 420)

                    detailPanel
                        .frame(minWidth: 400)
                }
            }
        }
        .frame(minWidth: 900, minHeight: 700)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var searchResultsPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                browseSectionsView
            } else {
                searchResultsList
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
        .border(Color.gray.opacity(0.2), width: 1)
    }

    private var browseSectionsView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(helpStore.sections) { section in
                    VStack(alignment: .leading, spacing: 0) {
                        // Section header
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(section.title)
                                    .font(.headline)
                                Text(section.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if let firstTopic = section.topics.first {
                                selectedTopicID = firstTopic.id
                                selectedResult = nil
                            }
                        }

                        Divider()

                        // Topics in section
                        ForEach(section.topics) { topic in
                            HStack(alignment: .center, spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(topic.title)
                                        .font(.subheadline.weight(.medium))
                                        .lineLimit(2)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(selectedTopicID == topic.id ? Color.accentColor.opacity(0.14) : Color.clear)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedTopicID = topic.id
                                selectedResult = nil
                            }
                        }
                        .padding(8)

                        Divider()
                    }
                }
            }
            .padding(8)
        }
    }

    private var searchResultsList: some View {
        Group {
            if displayResults.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No results found")
                        .font(.headline)
                    Text("Try different search terms")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(displayResults.count) result\(displayResults.count == 1 ? "" : "s")")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 12)
                            .padding(.top, 8)

                        ForEach(displayResults) { result in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: result.matchType == .title ? "text.quote" : "doc.text")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(result.topic.title)
                                            .font(.subheadline.weight(.semibold))

                                        Text(result.section.title)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer(minLength: 0)
                                }

                                if result.matchType == .body {
                                    let preview = result.topic.body
                                        .replacingOccurrences(of: "**", with: "")
                                        .replacingOccurrences(of: "\n", with: " ")
                                        .trimmingCharacters(in: .whitespacesAndNewlines)
                                    let truncated = preview.count > 120
                                        ? String(preview.prefix(120)) + "..."
                                        : preview

                                    Text(truncated)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(selectedResult?.id == result.id ? Color.accentColor.opacity(0.14) : Color.clear)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedResult = result
                                selectedTopicID = result.topic.id
                            }
                        }
                        .padding(8)
                    }
                }
            }
        }
    }

    private var detailPanel: some View {
        Group {
            if let topic = selectedTopicForDisplay, let section = selectedSectionForDisplay {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Breadcrumb
                        HStack(spacing: 6) {
                            Text(section.title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(topic.title)
                                .font(.caption.weight(.semibold))
                        }
                        .padding(12)
                        .background(Color.gray.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))

                        VStack(alignment: .leading, spacing: 12) {
                            Text(topic.title)
                                .font(.title2.weight(.semibold))

                            HelpTopicContentView(content: topic.body)
                        }

                        Spacer(minLength: 20)
                    }
                    .padding(20)
                }
                .background(Color(nsColor: .windowBackgroundColor))
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "book.circle")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("Select a topic")
                        .font(.headline)
                    Text("Browse sections or search to find help topics")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
            }
        }
    }
}

// MARK: - Content Renderer

struct HelpTopicContentView: View {
    let content: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            let lines = content.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Spacer(minLength: 8)
                } else if line.hasPrefix("•") {
                    // Bullet list item
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .foregroundStyle(.secondary)
                        HelpFormattedText(text: String(line.dropFirst().trimmingCharacters(in: .whitespacesAndNewlines)))
                            .font(.callout)
                            .lineLimit(nil)
                    }
                } else {
                    // Regular paragraph
                    HelpFormattedText(text: line)
                        .font(.callout)
                        .lineLimit(nil)
                }
            }
        }
    }
}

// MARK: - Formatted Text View

struct HelpFormattedText: View {
    let text: String

    var body: some View {
        var attributed = AttributedString()
        for segment in parseFormattedText(text) {
            var part = AttributedString(segment.text)
            if segment.isBold {
                part.inlinePresentationIntent = .stronglyEmphasized
            }
            attributed.append(part)
        }
        return Text(attributed)
            .frame(maxWidth: .infinity, alignment: .leading)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    HelpWindowView()
        .environmentObject(HelpStore())
}
