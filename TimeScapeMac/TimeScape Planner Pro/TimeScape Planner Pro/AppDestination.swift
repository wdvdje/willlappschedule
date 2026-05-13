//
//  AppDestination.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI

enum AppDestination: String, CaseIterable, Identifiable {
    case today
    case week
    case calendar
    case personal
    case household
    case professional
    case meals
    case apps
    case events
    case reminders
    case tasks
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "Today"
        case .week: return "Week"
        case .calendar: return "Calendar"
        case .personal: return "Personal"
        case .household: return "Household"
        case .professional: return "Professional"
        case .meals: return "Meals"
        case .apps: return "Apps"
        case .events: return "Events"
        case .reminders: return "Reminders"
        case .tasks: return "Tasks"
        case .settings: return "Settings"
        }
    }

    var subtitle: String {
        switch self {
        case .today: return "Daily overview and focus"
        case .week: return "Native weekly planning"
        case .calendar: return "Month, day, and schedule"
        case .personal: return "Personal routines and priorities"
        case .household: return "Home coordination and shared plans"
        case .professional: return "Career goals and work planning"
        case .meals: return "Weekly meal planning and nutrition"
        case .apps: return "Launcher and utilities"
        case .events: return "Event planning and management"
        case .reminders: return "Time-based nudges"
        case .tasks: return "Actionable work queue"
        case .settings: return "App preferences"
        }
    }

    var symbolName: String {
        switch self {
        case .today: return "house.fill"
        case .week: return "calendar.day.timeline.left"
        case .calendar: return "calendar"
        case .personal: return "person.circle"
        case .household: return "house"
        case .professional: return "briefcase"
        case .meals: return "fork.knife"
        case .apps: return "square.grid.2x2"
        case .events: return "calendar.badge.plus"
        case .reminders: return "bell"
        case .tasks: return "checklist"
        case .settings: return "gearshape"
        }
    }

    var accent: Color {
        switch self {
        case .today: return .blue
        case .week: return .purple
        case .calendar: return .cyan
        case .personal: return .mint
        case .household: return .teal
        case .professional: return .indigo
        case .meals: return .orange
        case .apps: return .pink
        case .events: return .indigo
        case .reminders: return .teal
        case .tasks: return .mint
        case .settings: return .orange
        }
    }

    var isImplemented: Bool {
        self == .today || self == .week || self == .calendar || self == .personal || self == .household || self == .professional || self == .meals || self == .apps || self == .events || self == .tasks || self == .reminders || self == .settings
    }

    var isDomain: Bool {
        switch self {
        case .personal, .household, .professional:
            return true
        default:
            return false
        }
    }

    var asDomain: BucketDomain? {
        switch self {
        case .personal:
            return .personal
        case .household:
            return .household
        case .professional:
            return .professional
        default:
            return nil
        }
    }

    var asPlanningKind: PlanningKind? {
        switch self {
        case .events:
            return .event
        case .tasks:
            return .task
        case .reminders:
            return .reminder
        default:
            return nil
        }
    }

    var isPlanningDestination: Bool {
        asPlanningKind != nil
    }
}
