import Foundation
import SwiftUI

// MARK: - Data Models

struct HelpSection: Identifiable, Codable {
    let id: String
    let title: String
    let description: String
    let topics: [HelpTopic]

    var displayName: String {
        title
    }
}

struct HelpTopic: Identifiable, Codable {
    let id: String
    let title: String
    let body: String

    var displayName: String {
        title
    }
}

// MARK: - Formatted Text Support

/// Represents a formatted text segment (for rendering bold keywords, etc.)
struct FormattedTextSegment: Identifiable {
    let id = UUID()
    let text: String
    let isBold: Bool
}

/// Parses help text to extract and bold keywords surrounded by **asterisks**
func parseFormattedText(_ text: String) -> [FormattedTextSegment] {
    var segments: [FormattedTextSegment] = []
    var currentText = ""
    var isBold = false
    var i = text.startIndex

    while i < text.endIndex {
        if i < text.index(text.endIndex, offsetBy: -1) && text[i] == "*" && text[text.index(after: i)] == "*" {
            // Found **
            if !currentText.isEmpty {
                segments.append(FormattedTextSegment(text: currentText, isBold: isBold))
                currentText = ""
            }
            isBold.toggle()
            i = text.index(i, offsetBy: 2)
        } else {
            currentText.append(text[i])
            i = text.index(after: i)
        }
    }

    if !currentText.isEmpty {
        segments.append(FormattedTextSegment(text: currentText, isBold: isBold))
    }

    return segments
}

/// Renders an array of FormattedTextSegments as an AttributedString
func formatTextAsAttributed(_ segments: [FormattedTextSegment]) -> AttributedString {
    var result = AttributedString()

    for segment in segments {
        var attrStr = AttributedString(segment.text)
        if segment.isBold {
            attrStr.font = .system(.body, design: .default).bold()
        }
        result.append(attrStr)
    }

    return result
}

// MARK: - Root Container

struct HelpContentRoot: Codable {
    let sections: [HelpSection]
}
