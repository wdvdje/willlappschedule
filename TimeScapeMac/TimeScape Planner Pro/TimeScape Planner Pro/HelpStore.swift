import Foundation
import Combine

@MainActor
final class HelpStore: ObservableObject {
    @Published private(set) var sections: [HelpSection] = []
    @Published private(set) var isLoading = true
    @Published private(set) var error: String?

    private var allTopics: [HelpTopic] = []

    init() {
        loadContent()
    }

    // MARK: - Content Loading

    private func loadContent() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                let sections = try self.loadFromJSON()
                DispatchQueue.main.async {
                    self.sections = sections
                    self.allTopics = sections.flatMap { $0.topics }
                    self.isLoading = false
                }
            } catch {
                DispatchQueue.main.async {
                    self.error = "Failed to load help content: \(error.localizedDescription)"
                    self.isLoading = false
                }
            }
        }
    }

    nonisolated private func loadFromJSON() throws -> [HelpSection] {
        // Try to load from bundle first
        if let bundleURL = Bundle.main.url(forResource: "help-content", withExtension: "json") {
            let data = try Data(contentsOf: bundleURL)
            let root = try JSONDecoder().decode(HelpContentRoot.self, from: data)
            return root.sections
        }

        // Fallback: try to load from app directory
        let fileManager = FileManager.default
        if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            let helpPath = appSupport.appendingPathComponent("TimeScape/help-content.json")
            if fileManager.fileExists(atPath: helpPath.path) {
                let data = try Data(contentsOf: helpPath)
                let root = try JSONDecoder().decode(HelpContentRoot.self, from: data)
                return root.sections
            }
        }

        throw NSError(domain: "HelpStore", code: -1, userInfo: [NSLocalizedDescriptionKey: "help-content.json not found"])
    }

    // MARK: - Search

    struct SearchResult: Identifiable {
        let id = UUID()
        let topic: HelpTopic
        let section: HelpSection
        let matchType: MatchType // title or body
        let relevance: Int // higher = more relevant

        enum MatchType {
            case title
            case body
        }
    }

    func search(query: String) -> [SearchResult] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return []
        }

        let lowercaseQuery = trimmedQuery.lowercased()
        var results: [SearchResult] = []

        for section in sections {
            for topic in section.topics {
                var relevance = 0
                var matchType: SearchResult.MatchType?

                // Check title match (higher relevance)
                if topic.title.lowercased().contains(lowercaseQuery) {
                    relevance += 100
                    matchType = .title
                }

                // Check body match (lower relevance)
                if topic.body.lowercased().contains(lowercaseQuery) {
                    relevance += 50
                    if matchType == nil {
                        matchType = .body
                    }
                }

                if let matchType = matchType {
                    results.append(SearchResult(
                        topic: topic,
                        section: section,
                        matchType: matchType,
                        relevance: relevance
                    ))
                }
            }
        }

        // Sort by relevance (descending), then by title
        return results.sorted { a, b in
            if a.relevance != b.relevance {
                return a.relevance > b.relevance
            }
            return a.topic.title.localizedCaseInsensitiveCompare(b.topic.title) == .orderedAscending
        }
    }

    // MARK: - Getters

    func topic(withID id: String) -> HelpTopic? {
        allTopics.first { $0.id == id }
    }

    func section(containingTopicID id: String) -> HelpSection? {
        sections.first { $0.topics.contains { $0.id == id } }
    }
}
