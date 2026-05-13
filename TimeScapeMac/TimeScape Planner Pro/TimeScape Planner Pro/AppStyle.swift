//
//  AppStyle.swift
//  TimeScape Planner Pro
//
//  Centralized styling constants, modifiers, and reusable view components for consistent UI/UX.
//

import SwiftUI

// MARK: - Spacing System

enum AppSpacing: CGFloat {
    case xCompact = 8      // Micro spacing, chips and tight rows
    case compact = 10      // Tight groupings, inline elements
    case small = 12        // Small grouping spacing
    case standard = 14     // Default padding/spacing between sections
    case generous = 16     // Moderate spacing, card padding
    case large = 18        // Large card content spacing
    case spacious = 22     // Major section padding and breaks
}

// MARK: - Opacity System

enum AppOpacity: Double {
    case fill = 0.16       // Card/container background fills
    case border = 0.34     // Card/container border strokes
    case hover = 0.10      // Hover state overlays
    case background = 0.06 // Subtle gradient backgrounds
}

// MARK: - Corner Radius System

enum AppCornerRadius: CGFloat {
    case card = 16         // Card and major containers
    case button = 10       // Buttons and small controls
    case pill = 999        // Fully rounded pills/badges
}

// MARK: - Motion and Transition System

enum AppMotion {
    static let micro = Animation.easeOut(duration: 0.12)
    static let hover = Animation.easeOut(duration: 0.16)
    static let standard = Animation.easeInOut(duration: 0.20)
    static let emphasis = Animation.spring(response: 0.32, dampingFraction: 0.82)
}

enum AppTransition {
    static let fade = AnyTransition.opacity
    static let moveUpFade = AnyTransition.move(edge: .bottom).combined(with: .opacity)
    static let scaleFade = AnyTransition.scale(scale: 0.98).combined(with: .opacity)
}

private struct AppAnimatedModifier<Value: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let value: Value
    let animation: Animation

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}

private struct AppTransitionModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let transition: AnyTransition

    func body(content: Content) -> some View {
        if reduceMotion {
            content.transition(.opacity)
        } else {
            content.transition(transition)
        }
    }
}

// MARK: - Text Styles (Semantic Typography)

struct AppTextStyle {
    let font: Font
    let foregroundColor: Color
    
    static let title = AppTextStyle(
        font: .title2.weight(.semibold),
        foregroundColor: .primary
    )
    
    static let subtitle = AppTextStyle(
        font: .subheadline.weight(.semibold),
        foregroundColor: .primary
    )
    
    static let body = AppTextStyle(
        font: .body,
        foregroundColor: .primary
    )
    
    static let label = AppTextStyle(
        font: .caption.weight(.semibold),
        foregroundColor: .primary
    )
    
    static let labelSecondary = AppTextStyle(
        font: .caption.weight(.semibold),
        foregroundColor: .secondary
    )
    
    static let description = AppTextStyle(
        font: .callout,
        foregroundColor: .secondary
    )
    
    static let caption = AppTextStyle(
        font: .caption,
        foregroundColor: .secondary
    )
    
    static let captionBold = AppTextStyle(
        font: .caption.weight(.semibold),
        foregroundColor: .secondary
    )
}

// MARK: - View Modifiers

extension View {
    /// Applies consistent card styling with background fill and border
    func cardStyle(color: Color) -> some View {
        self
            .padding(AppSpacing.generous.rawValue)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: AppCornerRadius.card.rawValue, style: .continuous)
                    .fill(color.opacity(AppOpacity.fill.rawValue))
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppCornerRadius.card.rawValue, style: .continuous)
                    .stroke(color.opacity(AppOpacity.border.rawValue), lineWidth: 1)
            )
    }
    
    /// Applies consistent card styling with tinted background and material
    func cardStyleWithMaterial(color: Color) -> some View {
        self
            .padding(AppSpacing.generous.rawValue)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: AppCornerRadius.card.rawValue, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppCornerRadius.card.rawValue, style: .continuous)
                    .stroke(color.opacity(AppOpacity.border.rawValue), lineWidth: 1)
            )
    }
    
    /// Applies semantic text styling
    func appTextStyle(_ style: AppTextStyle) -> some View {
        self
            .font(style.font)
            .foregroundStyle(style.foregroundColor)
    }
    
    /// Semantic label text style
    func appLabel() -> some View {
        self.appTextStyle(.label)
    }
    
    /// Semantic secondary label text style
    func appLabelSecondary() -> some View {
        self.appTextStyle(.labelSecondary)
    }
    
    /// Semantic title text style
    func appTitle() -> some View {
        self.appTextStyle(.title)
    }
    
    /// Semantic subtitle text style
    func appSubtitle() -> some View {
        self.appTextStyle(.subtitle)
    }
    
    /// Semantic body text style
    func appBody() -> some View {
        self.appTextStyle(.body)
    }
    
    /// Semantic description text style (callout, secondary)
    func appDescription() -> some View {
        self.appTextStyle(.description)
    }
    
    /// Semantic caption text style
    func appCaption() -> some View {
        self.appTextStyle(.caption)
    }
    
    /// Semantic caption bold text style
    func appCaptionBold() -> some View {
        self.appTextStyle(.captionBold)
    }

    /// Applies semantic animation with reduced-motion support
    func appAnimated<Value: Equatable>(_ value: Value, animation: Animation = AppMotion.standard) -> some View {
        self.modifier(AppAnimatedModifier(value: value, animation: animation))
    }

    /// Applies semantic transition with reduced-motion support
    func appTransition(_ transition: AnyTransition = AppTransition.fade) -> some View {
        self.modifier(AppTransitionModifier(transition: transition))
    }
}

// MARK: - Button Styles

enum AppButtonStyleVariant {
    case bordered
    case plain
    case bordered_prominent
}

extension View {
    /// Applies semantic app button styling with consistent variants
    func appButton(_ variant: AppButtonStyleVariant = .bordered) -> some View {
        switch variant {
        case .bordered:
            return AnyView(self.buttonStyle(.bordered))
        case .plain:
            return AnyView(self.buttonStyle(.plain))
        case .bordered_prominent:
            return AnyView(self.buttonStyle(.borderedProminent))
        }
    }
}

// MARK: - Reusable Components

/// Horizontal row of buttons with consistent spacing
struct AppButtonRow<Content: View>: View {
    let spacing: CGFloat
    let content: () -> Content
    
    init(spacing: CGFloat = AppSpacing.standard.rawValue, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }
    
    var body: some View {
        HStack(spacing: spacing) {
            content()
        }
    }
}

/// Label + value pair for metrics or property displays
struct AppMetricLabel: View {
    let label: String
    let value: String
    let tint: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .appCaption()
            Text(value)
                .appBody()
                .foregroundStyle(tint)
        }
    }
}

/// Simple card container with title and content
struct AppCard<Content: View>: View {
    let title: String
    let color: Color
    let content: () -> Content
    
    init(title: String, color: Color, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.color = color
        self.content = content
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppSpacing.standard.rawValue) {
            Text(title)
                .appLabel()
                .textCase(.uppercase)
            
            content()
        }
        .cardStyle(color: color)
    }
}

/// Inline chip/badge for status or tags
struct AppChip: View {
    let label: String
    let color: Color
    let icon: String?
    
    init(label: String, color: Color = .blue, icon: String? = nil) {
        self.label = label
        self.color = color
        self.icon = icon
    }
    
    var body: some View {
        HStack(spacing: 6) {
            if let icon {
                Image(systemName: icon)
                    .font(.caption.weight(.semibold))
            }
            Text(label)
                .appCaption()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.pill.rawValue, style: .continuous)
                .fill(color.opacity(AppOpacity.hover.rawValue))
        )
    }
}

// MARK: - Binding Helpers

extension Binding where Value: SetAlgebra, Value.Element: Hashable {
    /// Creates a Binding<Bool> for toggling a single element in a Set
    /// Usage: Toggle("Option", isOn: $filterSet.bind(for: .planningItem))
    func bind(for element: Value.Element) -> Binding<Bool> {
        Binding<Bool>(
            get: { self.wrappedValue.contains(element) },
            set: { newValue in
                if newValue {
                    self.wrappedValue.insert(element)
                } else {
                    _ = self.wrappedValue.remove(element)
                }
            }
        )
    }
}

// MARK: - Padding Helpers

extension View {
    /// Apply standard app padding (14 points)
    func paddingStandard() -> some View {
        self.padding(AppSpacing.standard.rawValue)
    }
    
    /// Apply generous app padding (16 points)
    func paddingGenerous() -> some View {
        self.padding(AppSpacing.generous.rawValue)
    }
    
    /// Apply compact app padding (10 points)
    func paddingCompact() -> some View {
        self.padding(AppSpacing.compact.rawValue)
    }
    
    /// Apply spacious app padding (22 points)
    func paddingSpacious() -> some View {
        self.padding(AppSpacing.spacious.rawValue)
    }
}

// MARK: - Spacing Helpers

extension View {
    /// Apply standard horizontal/vertical spacing
    func spacingStandard(_ edges: Edge.Set = .all) -> some View {
        self.padding(edges, AppSpacing.standard.rawValue)
    }
    
    /// Apply generous spacing
    func spacingGenerous(_ edges: Edge.Set = .all) -> some View {
        self.padding(edges, AppSpacing.generous.rawValue)
    }
}

// MARK: - Divider Helpers

struct AppDivider: View {
    let color: Color
    let opacity: Double
    
    init(color: Color = .primary, opacity: Double = 0.12) {
        self.color = color
        self.opacity = opacity
    }
    
    var body: some View {
        Divider()
            .overlay(color.opacity(opacity))
    }
}
