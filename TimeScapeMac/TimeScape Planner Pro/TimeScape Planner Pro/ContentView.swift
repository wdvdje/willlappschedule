//
//  ContentView.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI
import AppKit
import Combine

struct ContentView: View {
    @EnvironmentObject private var store: PlannerStore
    @State private var selection: AppDestination = .today
    @State private var isShowingOnboarding = false
    @State private var isShowingPersistenceAlert = false

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $selection)
        } detail: {
            NativeDestinationView(
                destination: selection,
                startOnboarding: { isShowingOnboarding = true }
            )
        }
        .frame(minWidth: 1100, minHeight: 760)
        .sheet(isPresented: $isShowingOnboarding) {
            OnboardingSetupView {
                store.markOnboardingCompleted()
                isShowingOnboarding = false
            } onSkip: {
                isShowingOnboarding = false
            }
        }
        .onChange(of: store.persistenceErrorMessage) { _, newValue in
            isShowingPersistenceAlert = newValue != nil
        }
        .alert("Unable to Save Changes", isPresented: $isShowingPersistenceAlert) {
            Button("OK", role: .cancel) {
                store.clearPersistenceError()
            }
        } message: {
            Text(store.persistenceErrorMessage ?? "An unknown error occurred while saving your planner data.")
        }
        .onAppear {
            if !store.hasCompletedOnboarding {
                isShowingOnboarding = true
            }
        }
    }
}

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

    enum CompanionAppStatus: String, CaseIterable, Identifiable {
        case live
        case preview
        case planned

        var id: String { rawValue }

        var label: String {
            switch self {
            case .live:
                return "Live"
            case .preview:
                return "Preview"
            case .planned:
                return "Planned"
            }
        }

        var tint: Color {
            switch self {
            case .live:
                return .green
            case .preview:
                return .orange
            case .planned:
                return .secondary
            }
        }
    }

    enum CompanionAppID: String, CaseIterable, Identifiable, Codable {
        case journal
        case weather
        case meals
        case dynamicMap
        case budgeting

        var id: String { rawValue }

        var title: String {
            switch self {
            case .journal:
                return "Journal"
            case .weather:
                return "Dynamic Weather"
            case .meals:
                return "Meals"
            case .dynamicMap:
                return "Dynamic Map"
            case .budgeting:
                return "Budgeting"
            }
        }

        var subtitle: String {
            switch self {
            case .journal:
                return "Capture entries and attach them to planning items"
            case .weather:
                return "Plan your week using forecast-aware insights"
            case .meals:
                return "Build meal plans, grocery lists, and nutrition snapshots"
            case .dynamicMap:
                return "Map item and bucket locations, then plan routes with traffic-aware ETAs"
            case .budgeting:
                return "Track earnings, expenses, and bucket-linked spending"
            }
        }

        var symbolName: String {
            switch self {
            case .journal:
                return "book.closed"
            case .weather:
                return "cloud.sun.rain"
            case .meals:
                return "fork.knife"
            case .dynamicMap:
                return "map"
            case .budgeting:
                return "dollarsign.circle"
            }
        }

        var accentStart: Color {
            switch self {
            case .journal:
                return .indigo
            case .weather:
                return .cyan
            case .meals:
                return .mint
            case .dynamicMap:
                return .teal
            case .budgeting:
                return .orange
            }
        }

        var accentEnd: Color {
            switch self {
            case .journal:
                return .purple
            case .weather:
                return .blue
            case .meals:
                return .teal
            case .dynamicMap:
                return .cyan
            case .budgeting:
                return .red
            }
        }

        var status: CompanionAppStatus {
            switch self {
            case .journal:
                return .live
            case .meals:
                return .live
            case .dynamicMap:
                return .preview
            case .weather, .budgeting:
                return .preview
            }
        }

        var windowID: String {
            "timescape.app.\(rawValue)"
        }

        var highlights: [String] {
            switch self {
            case .journal:
                return [
                    "Create timestamped entries with mood tags",
                    "Attach entries to item sub-items with inline snapshots",
                    "Open linked entries from planning cards"
                ]
            case .weather:
                return [
                    "Weekly mock forecast with day-by-day signals",
                    "Read-only planning insights for outdoor or commute blocks",
                    "Local-first data path, no API key required for v1"
                ]
            case .meals:
                return [
                    "Plan breakfast, lunch, and dinner by day",
                    "Generate grocery checklist from planned meals",
                    "Track nutrition and per-meal cost"
                ]
            case .dynamicMap:
                return [
                    "Sync location pins from planning items and professional bucket job sites",
                    "Build multi-stop routes with drive ETAs and alternate options",
                    "Write selected destinations back to planning item locations"
                ]
            case .budgeting:
                return [
                    "Log income and expenses with categories",
                    "Set budget targets and track remaining",
                    "Tag spend to personal, household, or professional buckets"
                ]
            }
        }
    }

    enum JournalMood: String, CaseIterable, Identifiable, Codable {
        case neutral
        case energized
        case calm
        case focused
        case stressed

        var id: String { rawValue }

        var label: String {
            switch self {
            case .neutral:
                return "Neutral"
            case .energized:
                return "Energized"
            case .calm:
                return "Calm"
            case .focused:
                return "Focused"
            case .stressed:
                return "Stressed"
            }
        }

        var symbolName: String {
            switch self {
            case .neutral:
                return "circle"
            case .energized:
                return "bolt.fill"
            case .calm:
                return "leaf.fill"
            case .focused:
                return "scope"
            case .stressed:
                return "exclamationmark.triangle.fill"
            }
        }

        var tint: Color {
            switch self {
            case .neutral:
                return .secondary
            case .energized:
                return .orange
            case .calm:
                return .mint
            case .focused:
                return .blue
            case .stressed:
                return .red
            }
        }
    }

    struct JournalEntry: Identifiable, Hashable, Codable {
        let id: UUID
        var title: String
        var body: String
        var mood: JournalMood
        var createdAt: Date
        var updatedAt: Date

        var trimmedTitle: String {
            title.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var trimmedBody: String {
            body.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var previewText: String {
            let source = trimmedBody.isEmpty ? trimmedTitle : trimmedBody
            guard !source.isEmpty else { return "" }
            if source.count <= 120 {
                return source
            }

            let idx = source.index(source.startIndex, offsetBy: 120)
            return String(source[..<idx]).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
        }
    }

    enum BucketDomain: String, CaseIterable, Identifiable, Codable {
        case personal
        case household
        case professional

        var id: String { rawValue }

        var title: String {
            switch self {
            case .personal: return "Personal"
            case .household: return "Household"
            case .professional: return "Professional"
            }
        }

        var symbolName: String {
            switch self {
            case .personal: return "person.circle"
            case .household: return "house"
            case .professional: return "briefcase"
            }
        }
    }

    struct PlannerSettings: Codable, Hashable {
        var displayName: String
        var prefersArchivedVisibleByDefault: Bool
        var hasCompletedOnboarding: Bool

        static let `default` = PlannerSettings(
            displayName: "",
            prefersArchivedVisibleByDefault: false,
            hasCompletedOnboarding: false
        )

        enum CodingKeys: String, CodingKey {
            case displayName
            case prefersArchivedVisibleByDefault
            case hasCompletedOnboarding
        }

        init(displayName: String, prefersArchivedVisibleByDefault: Bool, hasCompletedOnboarding: Bool) {
            self.displayName = displayName
            self.prefersArchivedVisibleByDefault = prefersArchivedVisibleByDefault
            self.hasCompletedOnboarding = hasCompletedOnboarding
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
            prefersArchivedVisibleByDefault = try container.decodeIfPresent(Bool.self, forKey: .prefersArchivedVisibleByDefault) ?? false
            hasCompletedOnboarding = try container.decodeIfPresent(Bool.self, forKey: .hasCompletedOnboarding) ?? false
        }
    }

    enum PlanningKind: String, CaseIterable, Identifiable, Codable {
        case event
        case task
        case reminder

        var id: String { rawValue }
    }

    enum RepeatRule: String, CaseIterable, Identifiable, Codable {
        case none
        case daily
        case weekdays
        case weekly
        case monthly
        case alternateWorkdays

        var id: String { rawValue }

        var label: String {
            switch self {
            case .none: return "None"
            case .daily: return "Daily"
            case .weekdays: return "Weekdays"
            case .weekly: return "Weekly"
            case .monthly: return "Monthly"
            case .alternateWorkdays: return "Alternate Workdays"
            }
        }
    }

    enum PriorityLevel: String, CaseIterable, Identifiable, Codable {
        case low
        case medium
        case high

        var id: String { rawValue }

        var label: String {
            rawValue.capitalized
        }
    }

    enum ReminderLeadTime: Int, CaseIterable, Identifiable, Codable {
        case atTime = 0
        case fiveMinutes = 5
        case fifteenMinutes = 15
        case thirtyMinutes = 30
        case oneHour = 60

        var id: Int { rawValue }

        var label: String {
            switch self {
            case .atTime: return "At time"
            case .fiveMinutes: return "5 min before"
            case .fifteenMinutes: return "15 min before"
            case .thirtyMinutes: return "30 min before"
            case .oneHour: return "1 hr before"
            }
        }
    }

    enum PlanningDateFilter: String, CaseIterable, Identifiable {
        case all
        case today
        case next7Days

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: return "All dates"
            case .today: return "Today"
            case .next7Days: return "Next 7 days"
            }
        }
    }

    enum BucketTone: String, CaseIterable, Identifiable, Codable {
        case ocean
        case mint
        case amber
        case coral
        case violet
        case slate

        var id: String { rawValue }

        var label: String {
            switch self {
            case .ocean: return "Ocean"
            case .mint: return "Mint"
            case .amber: return "Amber"
            case .coral: return "Coral"
            case .violet: return "Violet"
            case .slate: return "Slate"
            }
        }

        var hex: String {
            switch self {
            case .ocean: return "#3B82F6"
            case .mint: return "#10B981"
            case .amber: return "#F59E0B"
            case .coral: return "#F97316"
            case .violet: return "#8B5CF6"
            case .slate: return "#64748B"
            }
        }

        static func nearest(to hex: String) -> BucketTone {
            BucketTone.allCases.first(where: { $0.hex.caseInsensitiveCompare(hex) == .orderedSame }) ?? .ocean
        }
    }

    enum JobPayPeriod: String, CaseIterable, Codable, Identifiable {
        case hourly
        case salary

        var id: String { rawValue }

        var label: String {
            switch self {
            case .hourly:
                return "Hourly"
            case .salary:
                return "Salary"
            }
        }

        var suffix: String {
            switch self {
            case .hourly:
                return "/hr"
            case .salary:
                return "/yr"
            }
        }
    }

    enum RoutineFrequency: String, CaseIterable, Codable, Identifiable {
        case daily
        case weekly
        case biweekly
        case monthly

        var id: String { rawValue }

        var label: String {
            switch self {
            case .daily:
                return "Daily"
            case .weekly:
                return "Weekly"
            case .biweekly:
                return "Bi-weekly"
            case .monthly:
                return "Monthly"
            }
        }
    }

    enum ABPattern: String, CaseIterable, Codable, Identifiable {
        case a
        case b

        var id: String { rawValue }

        var label: String {
            switch self {
            case .a:
                return "Every Other"
            case .b:
                return "Complementary"
            }
        }
    }

    enum USHoliday: String, CaseIterable, Codable, Identifiable {
        case newYearsDay
        case memorialDay
        case independenceDay
        case laborDay
        case thanksgivingDay
        case christmasDay

        var id: String { rawValue }

        var label: String {
            switch self {
            case .newYearsDay:
                return "New Year's Day"
            case .memorialDay:
                return "Memorial Day"
            case .independenceDay:
                return "Independence Day"
            case .laborDay:
                return "Labor Day"
            case .thanksgivingDay:
                return "Thanksgiving"
            case .christmasDay:
                return "Christmas Day"
            }
        }
    }

    enum WorkHolidayPatternKind: String, CaseIterable, Codable, Identifiable {
        case specificDate
        case recurringMonthDay
        case predefinedUSHoliday

        var id: String { rawValue }
    }

    struct WorkHolidayPattern: Identifiable, Hashable, Codable {
        let id: UUID
        var kind: WorkHolidayPatternKind
        var specificDateISO: String?
        var recurringMonth: Int?
        var recurringDay: Int?
        var usHoliday: USHoliday?
        var isActive: Bool

        init(
            id: UUID = UUID(),
            kind: WorkHolidayPatternKind,
            specificDateISO: String? = nil,
            recurringMonth: Int? = nil,
            recurringDay: Int? = nil,
            usHoliday: USHoliday? = nil,
            isActive: Bool = true
        ) {
            self.id = id
            self.kind = kind
            self.specificDateISO = specificDateISO
            self.recurringMonth = recurringMonth
            self.recurringDay = recurringDay
            self.usHoliday = usHoliday
            self.isActive = isActive
        }
    }

    struct AlternateWorkdayConfig: Hashable, Codable {
        var startingPattern: ABPattern
        var respectsHolidayExclusions: Bool
        var itemHolidayPatterns: [WorkHolidayPattern]
        var skippedOccurrenceDateISOs: [String]
        var forcedIncludeDateISOs: [String]
        var untilDateISO: String?

        init(
            startingPattern: ABPattern = .a,
            respectsHolidayExclusions: Bool = true,
            itemHolidayPatterns: [WorkHolidayPattern] = [],
            skippedOccurrenceDateISOs: [String] = [],
            forcedIncludeDateISOs: [String] = [],
            untilDateISO: String? = nil
        ) {
            self.startingPattern = startingPattern
            self.respectsHolidayExclusions = respectsHolidayExclusions
            self.itemHolidayPatterns = itemHolidayPatterns
            self.skippedOccurrenceDateISOs = skippedOccurrenceDateISOs
            self.forcedIncludeDateISOs = forcedIncludeDateISOs
            self.untilDateISO = untilDateISO
        }
    }

    struct PlannerBucket: Identifiable, Hashable, Codable {
        let id: UUID
        var domain: BucketDomain
        var name: String
        var colorHex: String
        var icon: String
        var detail: String
        var isArchived: Bool
        var isDefault: Bool
        var isJob: Bool = false
        var payRate: Double? = nil
        var payPeriod: JobPayPeriod = .hourly
        var jobSite: String = ""
        var isRoutine: Bool = false
        var routineFrequency: RoutineFrequency = .weekly
        var jobHolidayPatterns: [WorkHolidayPattern] = []

        private enum CodingKeys: String, CodingKey {
            case id
            case domain
            case name
            case colorHex
            case icon
            case detail
            case isArchived
            case isDefault
            case isJob
            case payRate
            case payPeriod
            case jobSite
            case isRoutine
            case routineFrequency
            case jobHolidayPatterns
        }

        init(
            id: UUID,
            domain: BucketDomain,
            name: String,
            colorHex: String,
            icon: String,
            detail: String,
            isArchived: Bool,
            isDefault: Bool,
            isJob: Bool = false,
            payRate: Double? = nil,
            payPeriod: JobPayPeriod = .hourly,
            jobSite: String = "",
            isRoutine: Bool = false,
            routineFrequency: RoutineFrequency = .weekly,
            jobHolidayPatterns: [WorkHolidayPattern] = []
        ) {
            self.id = id
            self.domain = domain
            self.name = name
            self.colorHex = colorHex
            self.icon = icon
            self.detail = detail
            self.isArchived = isArchived
            self.isDefault = isDefault
            self.isJob = isJob
            self.payRate = payRate
            self.payPeriod = payPeriod
            self.jobSite = jobSite
            self.isRoutine = isRoutine
            self.routineFrequency = routineFrequency
            self.jobHolidayPatterns = jobHolidayPatterns
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            domain = try container.decode(BucketDomain.self, forKey: .domain)
            name = try container.decode(String.self, forKey: .name)
            colorHex = try container.decode(String.self, forKey: .colorHex)
            icon = try container.decode(String.self, forKey: .icon)
            detail = try container.decode(String.self, forKey: .detail)
            isArchived = try container.decodeIfPresent(Bool.self, forKey: .isArchived) ?? false
            isDefault = try container.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
            isJob = try container.decodeIfPresent(Bool.self, forKey: .isJob) ?? false
            payRate = try container.decodeIfPresent(Double.self, forKey: .payRate)
            payPeriod = try container.decodeIfPresent(JobPayPeriod.self, forKey: .payPeriod) ?? .hourly
            jobSite = try container.decodeIfPresent(String.self, forKey: .jobSite) ?? ""
            isRoutine = try container.decodeIfPresent(Bool.self, forKey: .isRoutine) ?? false
            routineFrequency = try container.decodeIfPresent(RoutineFrequency.self, forKey: .routineFrequency) ?? .weekly
            jobHolidayPatterns = try container.decodeIfPresent([WorkHolidayPattern].self, forKey: .jobHolidayPatterns) ?? []

            if domain != .professional {
                isJob = false
                payRate = nil
                payPeriod = .hourly
                jobSite = ""
                jobHolidayPatterns = []
            }

            if domain != .personal {
                isRoutine = false
                routineFrequency = .weekly
            }
        }
    }

    enum SubItemCategory {
        case native
        case companion
    }

    enum PlanningSubItemKind: String, CaseIterable, Identifiable, Codable {
        case task
        case reminder
        case event
        case journalEntry
        case url
        case favoriteLocation
        case savedRoute
        case mapTrip
        case outfit
        case weatherReport
        case pdfFile

        var id: String { rawValue }

        var label: String {
            switch self {
            case .task:
                return "Task"
            case .reminder:
                return "Reminder"
            case .event:
                return "Event"
            case .journalEntry:
                return "Journal Entry"
            case .url:
                return "URL"
            case .favoriteLocation:
                return "Favorite Location"
            case .savedRoute:
                return "Saved Route"
            case .mapTrip:
                return "Map Trip"
            case .outfit:
                return "Outfit"
            case .weatherReport:
                return "Weather Report"
            case .pdfFile:
                return "PDF"
            }
        }

        var symbolName: String {
            switch self {
            case .task:
                return "checklist"
            case .reminder:
                return "bell"
            case .event:
                return "calendar"
            case .journalEntry:
                return "book.closed"
            case .url:
                return "link"
            case .favoriteLocation:
                return "star"
            case .savedRoute:
                return "point.topleft.down.curvedto.point.bottomright.up"
            case .mapTrip:
                return "map"
            case .outfit:
                return "tshirt"
            case .weatherReport:
                return "cloud.sun"
            case .pdfFile:
                return "doc.pdf"
            }
        }

        var category: SubItemCategory {
            switch self {
            case .task, .reminder, .event, .url, .pdfFile:
                return .native
            case .journalEntry, .favoriteLocation, .savedRoute, .mapTrip, .outfit, .weatherReport:
                return .companion
            }
        }

        var companionAppID: CompanionAppID? {
            switch self {
            case .journalEntry:
                return .journal
            case .favoriteLocation, .savedRoute, .mapTrip:
                return .dynamicMap
            case .weatherReport:
                return .weather
            case .outfit:
                return nil  // no companion app yet
            case .task, .reminder, .event, .url, .pdfFile:
                return nil
            }
        }
    }

    struct PlanningSubItem: Identifiable, Hashable, Codable {
        let id: UUID
        var kind: PlanningSubItemKind
        var title: String
        var isCompleted: Bool
        var sourceApp: CompanionAppID? = nil
        var sourceEntryID: UUID? = nil
        var linkedItemID: UUID? = nil
        var urlString: String? = nil
        var pdfBookmarkData: Data? = nil

        init(
            id: UUID,
            kind: PlanningSubItemKind = .task,
            title: String,
            isCompleted: Bool,
            sourceApp: CompanionAppID? = nil,
            sourceEntryID: UUID? = nil,
            linkedItemID: UUID? = nil,
            urlString: String? = nil,
            pdfBookmarkData: Data? = nil
        ) {
            self.id = id
            self.kind = kind
            self.title = title
            self.isCompleted = isCompleted
            self.sourceApp = sourceApp
            self.sourceEntryID = sourceEntryID
            self.linkedItemID = linkedItemID
            self.urlString = urlString
            self.pdfBookmarkData = pdfBookmarkData
        }

        private enum CodingKeys: String, CodingKey {
            case id
            case kind
            case title
            case isCompleted
            case sourceApp
            case sourceEntryID
            case linkedItemID
            case urlString
            case pdfBookmarkData
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            kind = try container.decodeIfPresent(PlanningSubItemKind.self, forKey: .kind) ?? .task
            title = try container.decode(String.self, forKey: .title)
            isCompleted = try container.decode(Bool.self, forKey: .isCompleted)
            sourceApp = try container.decodeIfPresent(CompanionAppID.self, forKey: .sourceApp)
            sourceEntryID = try container.decodeIfPresent(UUID.self, forKey: .sourceEntryID)
            linkedItemID = try container.decodeIfPresent(UUID.self, forKey: .linkedItemID)
            urlString = try container.decodeIfPresent(String.self, forKey: .urlString)
            pdfBookmarkData = try container.decodeIfPresent(Data.self, forKey: .pdfBookmarkData)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(id, forKey: .id)
            try container.encode(kind, forKey: .kind)
            try container.encode(title, forKey: .title)
            try container.encode(isCompleted, forKey: .isCompleted)
            try container.encodeIfPresent(sourceApp, forKey: .sourceApp)
            try container.encodeIfPresent(sourceEntryID, forKey: .sourceEntryID)
            try container.encodeIfPresent(linkedItemID, forKey: .linkedItemID)
            try container.encodeIfPresent(urlString, forKey: .urlString)
            try container.encodeIfPresent(pdfBookmarkData, forKey: .pdfBookmarkData)
        }
    }

    struct PlanningItem: Identifiable, Hashable, Codable {
        let id: UUID
        var kind: PlanningKind
        var title: String
        var icon: String
        var domain: BucketDomain
        var bucketID: UUID
        var notes: String = ""
        var subItems: [PlanningSubItem] = []
        var priority: PriorityLevel = .medium
        var repeatRule: RepeatRule = .none
        var alternateWorkdayConfig: AlternateWorkdayConfig? = nil

        var startDate: Date? = nil
        var endDate: Date? = nil
        var isAllDay: Bool = false
        var startTime: Date? = nil
        var endTime: Date? = nil
        var location: String = ""

        var dueDate: Date? = nil
        var dueTime: Date? = nil
        var estimatedMinutes: Int? = nil

        var reminderDate: Date? = nil
        var reminderTime: Date? = nil
        var reminderLeadTime: ReminderLeadTime = .atTime
        var isCompleted: Bool = false
        var isRead: Bool = false

        private enum CodingKeys: String, CodingKey {
            case id
            case kind
            case title
            case icon
            case domain
            case bucketID
            case notes
            case subItems
            case priority
            case repeatRule
            case alternateWorkdayConfig
            case startDate
            case endDate
            case isAllDay
            case startTime
            case endTime
            case location
            case dueDate
            case dueTime
            case estimatedMinutes
            case reminderDate
            case reminderTime
            case reminderLeadTime
            case isCompleted
            case isRead
        }

        init(
            id: UUID,
            kind: PlanningKind,
            title: String,
            icon: String = "",
            domain: BucketDomain,
            bucketID: UUID,
            notes: String = "",
            subItems: [PlanningSubItem] = [],
            priority: PriorityLevel = .medium,
            repeatRule: RepeatRule = .none,
            alternateWorkdayConfig: AlternateWorkdayConfig? = nil,
            startDate: Date? = nil,
            endDate: Date? = nil,
            isAllDay: Bool = false,
            startTime: Date? = nil,
            endTime: Date? = nil,
            location: String = "",
            dueDate: Date? = nil,
            dueTime: Date? = nil,
            estimatedMinutes: Int? = nil,
            reminderDate: Date? = nil,
            reminderTime: Date? = nil,
            reminderLeadTime: ReminderLeadTime = .atTime,
            isCompleted: Bool = false,
            isRead: Bool = false
        ) {
            self.id = id
            self.kind = kind
            self.title = title
            let cleanIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
            self.icon = cleanIcon.isEmpty ? Self.defaultIcon(for: kind) : cleanIcon
            self.domain = domain
            self.bucketID = bucketID
            self.notes = notes
            self.subItems = subItems
            self.priority = priority
            self.repeatRule = repeatRule
            self.alternateWorkdayConfig = alternateWorkdayConfig
            self.startDate = startDate
            self.endDate = endDate
            self.isAllDay = isAllDay
            self.startTime = startTime
            self.endTime = endTime
            self.location = location
            self.dueDate = dueDate
            self.dueTime = dueTime
            self.estimatedMinutes = estimatedMinutes
            self.reminderDate = reminderDate
            self.reminderTime = reminderTime
            self.reminderLeadTime = reminderLeadTime
            self.isCompleted = isCompleted
            self.isRead = isRead
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            kind = try container.decode(PlanningKind.self, forKey: .kind)
            title = try container.decode(String.self, forKey: .title)
            let decodedIcon = try container.decodeIfPresent(String.self, forKey: .icon) ?? ""
            let cleanIcon = decodedIcon.trimmingCharacters(in: .whitespacesAndNewlines)
            icon = cleanIcon.isEmpty ? Self.defaultIcon(for: kind) : cleanIcon
            domain = try container.decode(BucketDomain.self, forKey: .domain)
            bucketID = try container.decode(UUID.self, forKey: .bucketID)
            notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
            subItems = try container.decodeIfPresent([PlanningSubItem].self, forKey: .subItems) ?? []
            priority = try container.decodeIfPresent(PriorityLevel.self, forKey: .priority) ?? .medium
            repeatRule = try container.decodeIfPresent(RepeatRule.self, forKey: .repeatRule) ?? .none
            alternateWorkdayConfig = try container.decodeIfPresent(AlternateWorkdayConfig.self, forKey: .alternateWorkdayConfig)
            startDate = try container.decodeIfPresent(Date.self, forKey: .startDate)
            endDate = try container.decodeIfPresent(Date.self, forKey: .endDate)
            isAllDay = try container.decodeIfPresent(Bool.self, forKey: .isAllDay) ?? false
            startTime = try container.decodeIfPresent(Date.self, forKey: .startTime)
            endTime = try container.decodeIfPresent(Date.self, forKey: .endTime)
            location = try container.decodeIfPresent(String.self, forKey: .location) ?? ""
            dueDate = try container.decodeIfPresent(Date.self, forKey: .dueDate)
            dueTime = try container.decodeIfPresent(Date.self, forKey: .dueTime)
            estimatedMinutes = try container.decodeIfPresent(Int.self, forKey: .estimatedMinutes)
            reminderDate = try container.decodeIfPresent(Date.self, forKey: .reminderDate)
            reminderTime = try container.decodeIfPresent(Date.self, forKey: .reminderTime)
            reminderLeadTime = try container.decodeIfPresent(ReminderLeadTime.self, forKey: .reminderLeadTime) ?? .atTime
            isCompleted = try container.decodeIfPresent(Bool.self, forKey: .isCompleted) ?? false
            isRead = try container.decodeIfPresent(Bool.self, forKey: .isRead) ?? false
        }

        static func defaultIcon(for kind: PlanningKind) -> String {
            switch kind {
            case .event:
                return "calendar"
            case .task:
                return "checkmark.circle"
            case .reminder:
                return "bell"
            }
        }
    }

    struct PlanningItemDraft {
        var kind: PlanningKind
        var title: String
        var icon: String
        var domain: BucketDomain
        var bucketID: UUID?

        var notes: String
        var subItems: [PlanningSubItem]
        var priority: PriorityLevel
        var repeatRule: RepeatRule
        var alternateWorkdayConfig: AlternateWorkdayConfig?

        var startDate: Date?
        var endDate: Date?
        var isAllDay: Bool
        var startTime: Date?
        var endTime: Date?
        var location: String

        var dueDate: Date?
        var dueTime: Date?
        var estimatedMinutes: Int?

        var reminderDate: Date?
        var reminderTime: Date?
        var reminderLeadTime: ReminderLeadTime
    }

    struct WeekItemPrefill {
        var kind: PlanningKind
        var domain: BucketDomain
        var bucketID: UUID? = nil
        var start: Date
        var end: Date
        var isAllDay: Bool
    }

    struct WeekInteractionPreview {
        var itemID: UUID
        var start: Date
        var durationMinutes: Int
    }

    struct DynamicMapFavoriteLocation: Identifiable, Hashable, Codable {
        let id: UUID
        var sourceID: String
        var title: String
        var subtitle: String
        var locationText: String
        var latitude: Double?
        var longitude: Double?
        var createdAt: Date
    }

    struct DynamicMapSavedRoute: Identifiable, Hashable, Codable {
        let id: UUID
        var title: String
        var orderedSourceIDs: [String]
        var lastSummary: String
        var createdAt: Date
        var updatedAt: Date
    }

    enum BudgetBillCadence: String, CaseIterable, Identifiable, Codable {
        case weekly
        case biweekly
        case monthly

        var id: String { rawValue }

        var label: String {
            switch self {
            case .weekly:
                return "Weekly"
            case .biweekly:
                return "Bi-weekly"
            case .monthly:
                return "Monthly"
            }
        }
    }

    struct BudgetCategory: Identifiable, Hashable, Codable {
        let id: UUID
        var title: String
        var colorHex: String
        var monthlyLimit: Double
        var isArchived: Bool
        var createdAt: Date
    }

    struct BudgetRecurringBill: Identifiable, Hashable, Codable {
        let id: UUID
        var title: String
        var amount: Double
        var categoryID: UUID
        var cadence: BudgetBillCadence
        var dueDay: Int
        var isActive: Bool
        var notes: String
        var createdAt: Date
        var updatedAt: Date
    }

    struct BudgetExpenseRecord: Identifiable, Hashable, Codable {
        let id: UUID
        var title: String
        var amount: Double
        var categoryID: UUID
        var date: Date
        var notes: String
        var createdAt: Date
    }

    enum BudgetPayrollCadence: String, CaseIterable, Identifiable, Codable {
        case weekly
        case biweekly
        case semimonthly
        case monthly
        case customDayOfMonth

        var id: String { rawValue }

        var label: String {
            switch self {
            case .weekly:
                return "Weekly"
            case .biweekly:
                return "Bi-weekly"
            case .semimonthly:
                return "Semi-monthly"
            case .monthly:
                return "Monthly"
            case .customDayOfMonth:
                return "Custom Day"
            }
        }
    }

    struct BudgetPayrollSchedule: Hashable, Codable {
        var cadence: BudgetPayrollCadence
        var anchorDateISO: String?
        var payWeekday: Int
        var dayOfMonth: Int
        var secondDayOfMonth: Int?

        init(
            cadence: BudgetPayrollCadence = .weekly,
            anchorDateISO: String? = nil,
            payWeekday: Int = 6,
            dayOfMonth: Int = 1,
            secondDayOfMonth: Int? = 15
        ) {
            self.cadence = cadence
            self.anchorDateISO = anchorDateISO
            self.payWeekday = payWeekday
            self.dayOfMonth = dayOfMonth
            self.secondDayOfMonth = secondDayOfMonth
        }
    }

    struct BudgetIncomeProjection {
        var grossIncome: Double
        var regularIncome: Double
        var overtimeIncome: Double
        var totalHours: Double
        var overtimeHours: Double
        var occurrenceCount: Int
    }

    struct BudgetCashFlowProjection {
        var projectedIncome: Double
        var projectedExpenses: Double
        var net: Double
    }

    struct BudgetPaycheckProjection: Identifiable {
        let id: UUID
        var bucketID: UUID
        var bucketName: String
        var periodStart: Date
        var periodEnd: Date
        var payDate: Date
        var gross: Double
        var net: Double
    }

    struct BudgetVarianceSnapshot {
        var projectedIncome: Double
        var actualIncomeToDate: Double
        var projectedSpend: Double
        var actualSpendToDate: Double
    }

    struct BudgetOvertimeImpact {
        var regularIncome: Double
        var overtimeIncome: Double
        var regularHours: Double
        var overtimeHours: Double
    }

    final class PlannerStore: ObservableObject {
        struct ItemScheduleState: Equatable {
            var startDate: Date?
            var endDate: Date?
            var startTime: Date?
            var endTime: Date?
            var isAllDay: Bool
            var dueDate: Date?
            var dueTime: Date?
            var reminderDate: Date?
            var reminderTime: Date?
        }

        @Published private(set) var buckets: [PlannerBucket]
        @Published private(set) var items: [PlanningItem]
        @Published private(set) var journalEntries: [JournalEntry]
        @Published private(set) var settings: PlannerSettings
        @Published private(set) var mapStopOrderByItem: [UUID: [UUID]]
        @Published private(set) var dynamicMapFavorites: [DynamicMapFavoriteLocation]
        @Published private(set) var dynamicMapSavedRoutes: [DynamicMapSavedRoute]
        @Published private(set) var budgetCategories: [BudgetCategory]
        @Published private(set) var budgetRecurringBills: [BudgetRecurringBill]
        @Published private(set) var budgetExpenseRecords: [BudgetExpenseRecord]
        @Published private(set) var budgetPayrollScheduleByBucket: [UUID: BudgetPayrollSchedule]
        @Published private(set) var budgetMonthlySavingsTarget: Double
        @Published private(set) var budgetTaxRate: Double
        @Published private(set) var pendingJournalEntryID: UUID?
        @Published private(set) var pendingDynamicMapRouteID: UUID?
        @Published private(set) var persistenceErrorMessage: String?

        private let defaultIDs: [BucketDomain: UUID]
        private var cancellables: Set<AnyCancellable> = []
        private var occurrenceCache: [String: [UUID: [Date]]] = [:]

        private struct PersistedState: Codable {
            let buckets: [PlannerBucket]
            let items: [PlanningItem]
            let journalEntries: [JournalEntry]
            let settings: PlannerSettings
            let mapStopOrderByItem: [UUID: [UUID]]
            let dynamicMapFavorites: [DynamicMapFavoriteLocation]
            let dynamicMapSavedRoutes: [DynamicMapSavedRoute]
            let budgetCategories: [BudgetCategory]
            let budgetRecurringBills: [BudgetRecurringBill]
            let budgetExpenseRecords: [BudgetExpenseRecord]
            let budgetPayrollScheduleByBucket: [UUID: BudgetPayrollSchedule]
            let budgetMonthlySavingsTarget: Double
            let budgetTaxRate: Double

            private enum CodingKeys: String, CodingKey {
                case buckets
                case items
                case journalEntries
                case settings
                case mapStopOrderByItem
                case dynamicMapFavorites
                case dynamicMapSavedRoutes
                case budgetCategories
                case budgetRecurringBills
                case budgetExpenseRecords
                case budgetPayrollScheduleByBucket
                case budgetMonthlySavingsTarget
                case budgetTaxRate
            }

            init(
                buckets: [PlannerBucket],
                items: [PlanningItem],
                journalEntries: [JournalEntry],
                settings: PlannerSettings,
                mapStopOrderByItem: [UUID: [UUID]],
                dynamicMapFavorites: [DynamicMapFavoriteLocation],
                dynamicMapSavedRoutes: [DynamicMapSavedRoute],
                budgetCategories: [BudgetCategory],
                budgetRecurringBills: [BudgetRecurringBill],
                budgetExpenseRecords: [BudgetExpenseRecord],
                budgetPayrollScheduleByBucket: [UUID: BudgetPayrollSchedule],
                budgetMonthlySavingsTarget: Double,
                budgetTaxRate: Double
            ) {
                self.buckets = buckets
                self.items = items
                self.journalEntries = journalEntries
                self.settings = settings
                self.mapStopOrderByItem = mapStopOrderByItem
                self.dynamicMapFavorites = dynamicMapFavorites
                self.dynamicMapSavedRoutes = dynamicMapSavedRoutes
                self.budgetCategories = budgetCategories
                self.budgetRecurringBills = budgetRecurringBills
                self.budgetExpenseRecords = budgetExpenseRecords
                self.budgetPayrollScheduleByBucket = budgetPayrollScheduleByBucket
                self.budgetMonthlySavingsTarget = budgetMonthlySavingsTarget
                self.budgetTaxRate = budgetTaxRate
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                buckets = try container.decodeIfPresent([PlannerBucket].self, forKey: .buckets) ?? []
                items = try container.decodeIfPresent([PlanningItem].self, forKey: .items) ?? []
                journalEntries = try container.decodeIfPresent([JournalEntry].self, forKey: .journalEntries) ?? []
                settings = try container.decodeIfPresent(PlannerSettings.self, forKey: .settings) ?? .default
                mapStopOrderByItem = try container.decodeIfPresent([UUID: [UUID]].self, forKey: .mapStopOrderByItem) ?? [:]
                dynamicMapFavorites = try container.decodeIfPresent([DynamicMapFavoriteLocation].self, forKey: .dynamicMapFavorites) ?? []
                dynamicMapSavedRoutes = try container.decodeIfPresent([DynamicMapSavedRoute].self, forKey: .dynamicMapSavedRoutes) ?? []
                budgetCategories = try container.decodeIfPresent([BudgetCategory].self, forKey: .budgetCategories) ?? PlannerStore.defaultBudgetCategories()
                budgetRecurringBills = try container.decodeIfPresent([BudgetRecurringBill].self, forKey: .budgetRecurringBills) ?? []
                budgetExpenseRecords = try container.decodeIfPresent([BudgetExpenseRecord].self, forKey: .budgetExpenseRecords) ?? []
                budgetPayrollScheduleByBucket = try container.decodeIfPresent([UUID: BudgetPayrollSchedule].self, forKey: .budgetPayrollScheduleByBucket) ?? [:]
                budgetMonthlySavingsTarget = try container.decodeIfPresent(Double.self, forKey: .budgetMonthlySavingsTarget) ?? 500
                budgetTaxRate = try container.decodeIfPresent(Double.self, forKey: .budgetTaxRate) ?? 0.22
            }
        }

        private struct LegacyPersistedStateV1: Codable {
            let buckets: [PlannerBucket]
            let items: [PlanningItem]
        }

        private static let personalDefaultID = UUID(uuidString: "E4D7BC6E-A0BE-4B44-8B59-819AC57FC9A9")!
        private static let householdDefaultID = UUID(uuidString: "6F851A57-7D31-4F6B-B4BC-7761C5B4D4B7")!
        private static let professionalDefaultID = UUID(uuidString: "B0A3F357-06B2-4F5D-B4F2-1B2E4862CB3E")!

        init() {
            let personalDefault = Self.personalDefaultID
            let householdDefault = Self.householdDefaultID
            let professionalDefault = Self.professionalDefaultID

            defaultIDs = [
                .personal: personalDefault,
                .household: householdDefault,
                .professional: professionalDefault
            ]

            let seededBuckets = [
                PlannerBucket(id: personalDefault, domain: .personal, name: "General", colorHex: BucketTone.mint.hex, icon: "person", detail: "Default personal bucket", isArchived: false, isDefault: true),
                PlannerBucket(id: householdDefault, domain: .household, name: "General", colorHex: BucketTone.amber.hex, icon: "house", detail: "Default household bucket", isArchived: false, isDefault: true),
                PlannerBucket(id: professionalDefault, domain: .professional, name: "General", colorHex: BucketTone.ocean.hex, icon: "briefcase", detail: "Default professional bucket", isArchived: false, isDefault: true)
            ]

            let seededItems = [
                PlanningItem(id: UUID(), kind: .event, title: "Doctor appointment", domain: .personal, bucketID: personalDefault),
                PlanningItem(id: UUID(), kind: .task, title: "Grocery restock", domain: .household, bucketID: householdDefault),
                PlanningItem(id: UUID(), kind: .reminder, title: "Send project update", domain: .professional, bucketID: professionalDefault)
            ]

            let seededJournalEntries = [
                JournalEntry(
                    id: UUID(),
                    title: "Kickoff Reflection",
                    body: "Mapped the first native app-platform slice and aligned it with planner workflows.",
                    mood: .focused,
                    createdAt: Date(),
                    updatedAt: Date()
                )
            ]

            if let persisted = Self.loadState(defaultIDs: defaultIDs) {
                buckets = persisted.buckets
                items = persisted.items
                journalEntries = persisted.journalEntries
                settings = persisted.settings
                mapStopOrderByItem = persisted.mapStopOrderByItem
                dynamicMapFavorites = persisted.dynamicMapFavorites
                dynamicMapSavedRoutes = persisted.dynamicMapSavedRoutes
                budgetCategories = persisted.budgetCategories
                budgetRecurringBills = persisted.budgetRecurringBills
                budgetExpenseRecords = persisted.budgetExpenseRecords
                budgetPayrollScheduleByBucket = persisted.budgetPayrollScheduleByBucket
                budgetMonthlySavingsTarget = persisted.budgetMonthlySavingsTarget
                budgetTaxRate = persisted.budgetTaxRate
            } else {
                buckets = seededBuckets
                items = seededItems
                journalEntries = seededJournalEntries
                settings = .default
                mapStopOrderByItem = [:]
                dynamicMapFavorites = []
                dynamicMapSavedRoutes = []
                budgetCategories = Self.defaultBudgetCategories()
                budgetRecurringBills = []
                budgetExpenseRecords = []
                budgetPayrollScheduleByBucket = [:]
                budgetMonthlySavingsTarget = 500
                budgetTaxRate = 0.22
            }

            pendingJournalEntryID = nil
            pendingDynamicMapRouteID = nil
            persistenceErrorMessage = nil

            bindPersistence()
        }

        var preferredDisplayName: String {
            let clean = settings.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            return clean.isEmpty ? "Planner Pro" : clean
        }

        var hasCompletedOnboarding: Bool {
            settings.hasCompletedOnboarding
        }

        func bucket(for id: UUID) -> PlannerBucket? {
            buckets.first(where: { $0.id == id })
        }

        func item(for id: UUID) -> PlanningItem? {
            items.first(where: { $0.id == id })
        }

        func journalEntry(for id: UUID) -> JournalEntry? {
            journalEntries.first(where: { $0.id == id })
        }

        func queueJournalEntrySelection(_ id: UUID) {
            pendingJournalEntryID = id
        }

        func consumePendingJournalEntrySelection() -> UUID? {
            let pending = pendingJournalEntryID
            pendingJournalEntryID = nil
            return pending
        }

        func queueDynamicMapRouteSelection(_ id: UUID) {
            pendingDynamicMapRouteID = id
        }

        func consumePendingDynamicMapRouteSelection() -> UUID? {
            let pending = pendingDynamicMapRouteID
            pendingDynamicMapRouteID = nil
            return pending
        }

        func dynamicMapFavorite(for id: UUID) -> DynamicMapFavoriteLocation? {
            dynamicMapFavorites.first(where: { $0.id == id })
        }

        func dynamicMapSavedRoute(for id: UUID) -> DynamicMapSavedRoute? {
            dynamicMapSavedRoutes.first(where: { $0.id == id })
        }

        @discardableResult
        func createDynamicMapFavorite(
            sourceID: String,
            title: String,
            subtitle: String,
            locationText: String,
            latitude: Double?,
            longitude: Double?
        ) -> UUID? {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanLocation = locationText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty, !cleanLocation.isEmpty else { return nil }

            if let existing = dynamicMapFavorites.first(where: { $0.sourceID == sourceID || $0.locationText.caseInsensitiveCompare(cleanLocation) == .orderedSame }) {
                return existing.id
            }

            let favorite = DynamicMapFavoriteLocation(
                id: UUID(),
                sourceID: sourceID,
                title: cleanTitle,
                subtitle: subtitle,
                locationText: cleanLocation,
                latitude: latitude,
                longitude: longitude,
                createdAt: Date()
            )
            dynamicMapFavorites.insert(favorite, at: 0)
            return favorite.id
        }

        @discardableResult
        func createDynamicMapSavedRoute(title: String, orderedSourceIDs: [String], lastSummary: String) -> UUID? {
            let cleanedIDs = orderedSourceIDs.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            guard cleanedIDs.count >= 2 else { return nil }

            if let existing = dynamicMapSavedRoutes.first(where: { $0.orderedSourceIDs == cleanedIDs }) {
                return existing.id
            }

            let now = Date()
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let route = DynamicMapSavedRoute(
                id: UUID(),
                title: cleanTitle.isEmpty ? "Saved Route" : cleanTitle,
                orderedSourceIDs: cleanedIDs,
                lastSummary: lastSummary,
                createdAt: now,
                updatedAt: now
            )
            dynamicMapSavedRoutes.insert(route, at: 0)
            return route.id
        }

        func renameDynamicMapSavedRoute(routeID: UUID, title: String) {
            guard let idx = dynamicMapSavedRoutes.firstIndex(where: { $0.id == routeID }) else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return }
            dynamicMapSavedRoutes[idx].title = cleanTitle
            dynamicMapSavedRoutes[idx].updatedAt = Date()
        }

        func deleteDynamicMapSavedRoute(routeID: UUID) {
            dynamicMapSavedRoutes.removeAll { $0.id == routeID }
        }

        func addFavoriteLocationSubItem(to itemID: UUID, favoriteID: UUID, title: String) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].subItems.contains(where: { $0.kind == .favoriteLocation && $0.sourceEntryID == favoriteID }) == false else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            items[idx].subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .favoriteLocation,
                    title: cleanTitle.isEmpty ? "Favorite Location" : cleanTitle,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: favoriteID
                )
            )
        }

        func addSavedRouteSubItem(to itemID: UUID, routeID: UUID, title: String) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].subItems.contains(where: { $0.kind == .savedRoute && $0.sourceEntryID == routeID }) == false else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            items[idx].subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .savedRoute,
                    title: cleanTitle.isEmpty ? "Saved Route" : cleanTitle,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: routeID
                )
            )
        }

        func createJournalEntry(title: String, body: String, mood: JournalMood, createdAt: Date) -> UUID? {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty || !cleanBody.isEmpty else { return nil }

            let entry = JournalEntry(
                id: UUID(),
                title: cleanTitle.isEmpty ? "Untitled Entry" : cleanTitle,
                body: cleanBody,
                mood: mood,
                createdAt: createdAt,
                updatedAt: Date()
            )

            journalEntries.insert(entry, at: 0)
            return entry.id
        }

        func updateJournalEntry(id: UUID, title: String, body: String, mood: JournalMood, createdAt: Date) {
            guard let idx = journalEntries.firstIndex(where: { $0.id == id }) else { return }

            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty || !cleanBody.isEmpty else { return }

            journalEntries[idx].title = cleanTitle.isEmpty ? "Untitled Entry" : cleanTitle
            journalEntries[idx].body = cleanBody
            journalEntries[idx].mood = mood
            journalEntries[idx].createdAt = createdAt
            journalEntries[idx].updatedAt = Date()
        }

        func deleteJournalEntry(id: UUID) {
            journalEntries.removeAll { $0.id == id }

            items = items.map { item in
                var updatedItem = item
                updatedItem.subItems = item.subItems.map { subItem in
                    var updatedSubItem = subItem
                    if updatedSubItem.sourceApp == .journal && updatedSubItem.sourceEntryID == id {
                        updatedSubItem.sourceApp = nil
                        updatedSubItem.sourceEntryID = nil
                    }
                    return updatedSubItem
                }
                return updatedItem
            }
            persistState()
        }

        func defaultBucket(for domain: BucketDomain) -> PlannerBucket {
            if let id = defaultIDs[domain], let bucket = bucket(for: id) {
                return bucket
            }
            return PlannerBucket(id: UUID(), domain: domain, name: "General", colorHex: BucketTone.slate.hex, icon: "tray", detail: "Fallback", isArchived: false, isDefault: true)
        }

        func activeBuckets(for domain: BucketDomain) -> [PlannerBucket] {
            buckets.filter { $0.domain == domain && !$0.isArchived }
                .sorted { lhs, rhs in
                    if lhs.isDefault != rhs.isDefault { return lhs.isDefault }
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
        }

        func archivedBuckets(for domain: BucketDomain) -> [PlannerBucket] {
            buckets.filter { $0.domain == domain && $0.isArchived }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }

        func bucketsForPicker(domain: BucketDomain) -> [PlannerBucket] {
            activeBuckets(for: domain)
        }

        func items(for kind: PlanningKind) -> [PlanningItem] {
            items.filter { $0.kind == kind }
        }

        func items(for domain: BucketDomain) -> [PlanningItem] {
            items.filter { $0.domain == domain }
        }

        func items(for bucketID: UUID) -> [PlanningItem] {
            items.filter { $0.bucketID == bucketID }
        }

        @discardableResult
        func createBucket(domain: BucketDomain, name: String, colorHex: String, icon: String, detail: String, isJob: Bool, payRate: Double?, payPeriod: JobPayPeriod, jobSite: String, isRoutine: Bool, routineFrequency: RoutineFrequency) -> UUID? {
            let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanJobSite = jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanName.isEmpty, !cleanIcon.isEmpty, !cleanDetail.isEmpty else { return nil }

            let canUseJobFields = domain == .professional && isJob
            let resolvedPayRate = canUseJobFields ? payRate : nil
            let resolvedJobSite = canUseJobFields ? cleanJobSite : ""
            if canUseJobFields {
                guard resolvedPayRate != nil, !resolvedJobSite.isEmpty else { return nil }
            }

            let canUseRoutineFields = domain == .personal && isRoutine
            let bucketID = UUID()

            buckets.append(
                PlannerBucket(
                    id: bucketID,
                    domain: domain,
                    name: cleanName,
                    colorHex: colorHex,
                    icon: cleanIcon,
                    detail: cleanDetail,
                    isArchived: false,
                    isDefault: false,
                    isJob: canUseJobFields,
                    payRate: resolvedPayRate,
                    payPeriod: canUseJobFields ? payPeriod : .hourly,
                    jobSite: resolvedJobSite,
                    isRoutine: canUseRoutineFields,
                    routineFrequency: canUseRoutineFields ? routineFrequency : .weekly,
                    jobHolidayPatterns: []
                )
            )
            persistState()
            return bucketID
        }

        func updateBucketJobHolidayPatterns(bucketID: UUID, patterns: [WorkHolidayPattern]) {
            guard let idx = buckets.firstIndex(where: { $0.id == bucketID }) else { return }
            guard buckets[idx].domain == .professional && buckets[idx].isJob else { return }
            buckets[idx].jobHolidayPatterns = sanitizedHolidayPatterns(patterns)
            persistState()
        }

        func updateDefaultBucket(domain: BucketDomain, name: String, colorHex: String, icon: String, detail: String) {
            guard let bucketID = defaultIDs[domain] else { return }

            let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanName.isEmpty, !cleanIcon.isEmpty, !cleanDetail.isEmpty else { return }

            if let idx = buckets.firstIndex(where: { $0.id == bucketID }) {
                buckets[idx].name = cleanName
                buckets[idx].colorHex = colorHex
                buckets[idx].icon = cleanIcon
                buckets[idx].detail = cleanDetail
            } else {
                buckets.append(
                    PlannerBucket(
                        id: bucketID,
                        domain: domain,
                        name: cleanName,
                        colorHex: colorHex,
                        icon: cleanIcon,
                        detail: cleanDetail,
                        isArchived: false,
                        isDefault: true
                    )
                )
            }

            persistState()
        }

        func updateBucket(id: UUID, name: String, colorHex: String, icon: String, detail: String, isJob: Bool, payRate: Double?, payPeriod: JobPayPeriod, jobSite: String, isRoutine: Bool, routineFrequency: RoutineFrequency) {
            guard let idx = buckets.firstIndex(where: { $0.id == id }) else { return }
            guard !buckets[idx].isDefault else { return }

            let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanJobSite = jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanName.isEmpty, !cleanIcon.isEmpty, !cleanDetail.isEmpty else { return }

            let canUseJobFields = buckets[idx].domain == .professional && isJob
            let resolvedPayRate = canUseJobFields ? payRate : nil
            let resolvedJobSite = canUseJobFields ? cleanJobSite : ""
            if canUseJobFields {
                guard resolvedPayRate != nil, !resolvedJobSite.isEmpty else { return }
            }

            let canUseRoutineFields = buckets[idx].domain == .personal && isRoutine

            buckets[idx].name = cleanName
            buckets[idx].colorHex = colorHex
            buckets[idx].icon = cleanIcon
            buckets[idx].detail = cleanDetail
            buckets[idx].isJob = canUseJobFields
            buckets[idx].payRate = resolvedPayRate
            buckets[idx].payPeriod = canUseJobFields ? payPeriod : .hourly
            buckets[idx].jobSite = resolvedJobSite
            buckets[idx].isRoutine = canUseRoutineFields
            buckets[idx].routineFrequency = canUseRoutineFields ? routineFrequency : .weekly
            if !canUseJobFields {
                buckets[idx].jobHolidayPatterns = []
            }
            persistState()
        }

        func archiveBucket(id: UUID) {
            guard let idx = buckets.firstIndex(where: { $0.id == id }) else { return }
            guard !buckets[idx].isDefault else { return }
            buckets[idx].isArchived = true
            persistState()
        }

        func unarchiveBucket(id: UUID) {
            guard let idx = buckets.firstIndex(where: { $0.id == id }) else { return }
            buckets[idx].isArchived = false
            persistState()
        }

        func deleteBucket(id: UUID) {
            guard let bucket = bucket(for: id) else { return }
            guard !bucket.isDefault else { return }

            let fallback = defaultBucket(for: bucket.domain)

            items = items.map { item in
                guard item.bucketID == id else { return item }
                var changed = item
                changed.domain = bucket.domain
                changed.bucketID = fallback.id
                return changed
            }

            buckets.removeAll { $0.id == id }
            persistState()
        }

        func updateItemDomain(itemID: UUID, domain: BucketDomain) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            items[idx].domain = domain
            items[idx].bucketID = defaultBucket(for: domain).id
            persistState()
        }

        func updateItemBucket(itemID: UUID, bucketID: UUID) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard let bucket = bucket(for: bucketID), !bucket.isArchived else { return }
            items[idx].domain = bucket.domain
            items[idx].bucketID = bucket.id
            persistState()
        }

        func updateItemTitle(itemID: UUID, title: String) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return }
            items[idx].title = cleanTitle
            persistState()
        }

        func updateItemLocation(itemID: UUID, location: String) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            items[idx].location = location.trimmingCharacters(in: .whitespacesAndNewlines)
            persistState()
        }

        func setMapStopOrder(for itemID: UUID, orderedStopIDs: [UUID]) {
            mapStopOrderByItem[itemID] = orderedStopIDs
            persistState()
        }

        func mapStopOrder(for itemID: UUID) -> [UUID] {
            mapStopOrderByItem[itemID] ?? []
        }

        func updateItem(itemID: UUID, from draft: PlanningItemDraft) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }

            let cleanTitle = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return }

            let resolvedBucket: PlannerBucket
            if let bucketID = draft.bucketID, let bucket = bucket(for: bucketID), !bucket.isArchived {
                resolvedBucket = bucket
            } else {
                resolvedBucket = defaultBucket(for: draft.domain)
            }

            items[idx].kind = draft.kind
            items[idx].title = cleanTitle
            let cleanIcon = draft.icon.trimmingCharacters(in: .whitespacesAndNewlines)
            items[idx].icon = cleanIcon.isEmpty ? PlanningItem.defaultIcon(for: draft.kind) : cleanIcon
            items[idx].domain = resolvedBucket.domain
            items[idx].bucketID = resolvedBucket.id
            items[idx].notes = draft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            items[idx].subItems = sanitizedSubItems(draft.subItems)
            items[idx].priority = draft.priority
            let canUseAlternateRule = resolvedBucket.domain == .professional && resolvedBucket.isJob
            items[idx].repeatRule = (draft.repeatRule == .alternateWorkdays && !canUseAlternateRule) ? .none : draft.repeatRule
            items[idx].alternateWorkdayConfig = items[idx].repeatRule == .alternateWorkdays
                ? sanitizedAlternateConfig(draft.alternateWorkdayConfig)
                    ?? sanitizedAlternateConfig(defaultAlternateConfig(for: items[idx]))
                : nil
            items[idx].startDate = draft.startDate
            items[idx].endDate = draft.endDate
            items[idx].isAllDay = draft.isAllDay
            items[idx].startTime = draft.startTime
            items[idx].endTime = draft.endTime
            items[idx].location = draft.location.trimmingCharacters(in: .whitespacesAndNewlines)
            items[idx].dueDate = draft.dueDate
            items[idx].dueTime = draft.dueTime
            items[idx].estimatedMinutes = draft.estimatedMinutes
            items[idx].reminderDate = draft.reminderDate
            items[idx].reminderTime = draft.reminderTime
            items[idx].reminderLeadTime = draft.reminderLeadTime
            persistState()
        }

        func scheduleState(for itemID: UUID) -> ItemScheduleState? {
            guard let item = item(for: itemID) else { return nil }
            return ItemScheduleState(
                startDate: item.startDate,
                endDate: item.endDate,
                startTime: item.startTime,
                endTime: item.endTime,
                isAllDay: item.isAllDay,
                dueDate: item.dueDate,
                dueTime: item.dueTime,
                reminderDate: item.reminderDate,
                reminderTime: item.reminderTime
            )
        }

        func restoreScheduleState(itemID: UUID, state: ItemScheduleState) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }

            items[idx].startDate = state.startDate
            items[idx].endDate = state.endDate
            items[idx].startTime = state.startTime
            items[idx].endTime = state.endTime
            items[idx].isAllDay = state.isAllDay
            items[idx].dueDate = state.dueDate
            items[idx].dueTime = state.dueTime
            items[idx].reminderDate = state.reminderDate
            items[idx].reminderTime = state.reminderTime
            persistState()
        }

        func moveItem(itemID: UUID, to start: Date, durationMinutes: Int? = nil) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }

            switch items[idx].kind {
            case .event:
                let resolvedDuration = max(durationMinutes ?? eventDurationMinutes(for: items[idx]), 30)
                applyEventSchedule(index: idx, start: start, durationMinutes: resolvedDuration)

            case .task:
                items[idx].dueDate = dayOnly(from: start)
                items[idx].dueTime = timeOnly(from: start)

            case .reminder:
                items[idx].reminderDate = dayOnly(from: start)
                items[idx].reminderTime = timeOnly(from: start)
            }
            persistState()
        }

        func resizeEvent(itemID: UUID, toStart start: Date, durationMinutes: Int) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].kind == .event else { return }
            applyEventSchedule(index: idx, start: start, durationMinutes: max(durationMinutes, 30))
            persistState()
        }

        func toggleTaskCompletion(itemID: UUID) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].kind == .task else { return }
            items[idx].isCompleted.toggle()
            persistState()
        }

        func setReminderRead(itemID: UUID, isRead: Bool) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].kind == .reminder else { return }
            items[idx].isRead = isRead
            persistState()
        }

        func duplicateItem(itemID: UUID) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            let source = items[idx]

            let resolvedBucketID: UUID
            if let bucket = bucket(for: source.bucketID), !bucket.isArchived {
                resolvedBucketID = bucket.id
            } else {
                resolvedBucketID = defaultBucket(for: source.domain).id
            }

            let duplicate = PlanningItem(
                id: UUID(),
                kind: source.kind,
                title: "\(source.title) Copy",
                icon: source.icon,
                domain: source.domain,
                bucketID: resolvedBucketID,
                notes: source.notes,
                subItems: source.subItems.map {
                    PlanningSubItem(
                        id: UUID(),
                        kind: $0.kind,
                        title: $0.title,
                        isCompleted: $0.isCompleted,
                        sourceApp: $0.sourceApp,
                        sourceEntryID: $0.sourceEntryID,
                        linkedItemID: $0.linkedItemID,
                        urlString: $0.urlString
                    )
                },
                priority: source.priority,
                repeatRule: source.repeatRule,
                alternateWorkdayConfig: source.alternateWorkdayConfig,
                startDate: source.startDate,
                endDate: source.endDate,
                isAllDay: source.isAllDay,
                startTime: source.startTime,
                endTime: source.endTime,
                location: source.location,
                dueDate: source.dueDate,
                dueTime: source.dueTime,
                estimatedMinutes: source.estimatedMinutes,
                reminderDate: source.reminderDate,
                reminderTime: source.reminderTime,
                reminderLeadTime: source.reminderLeadTime,
                isCompleted: false,
                isRead: false
            )

            items.insert(duplicate, at: idx + 1)
            persistState()
        }

        func deleteItem(itemID: UUID) {
            items.removeAll { $0.id == itemID }
            persistState()
        }

        func createItem(from draft: PlanningItemDraft) {
            let cleanTitle = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return }

            let resolvedBucket: PlannerBucket
            if let bucketID = draft.bucketID, let bucket = bucket(for: bucketID), !bucket.isArchived {
                resolvedBucket = bucket
            } else {
                resolvedBucket = defaultBucket(for: draft.domain)
            }

            let created = PlanningItem(
                id: UUID(),
                kind: draft.kind,
                title: cleanTitle,
                icon: draft.icon,
                domain: resolvedBucket.domain,
                bucketID: resolvedBucket.id,
                notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines),
                subItems: sanitizedSubItems(draft.subItems),
                priority: draft.priority,
                repeatRule: (draft.repeatRule == .alternateWorkdays && !(resolvedBucket.domain == .professional && resolvedBucket.isJob)) ? .none : draft.repeatRule,
                alternateWorkdayConfig: (draft.repeatRule == .alternateWorkdays && resolvedBucket.domain == .professional && resolvedBucket.isJob)
                    ? (
                        sanitizedAlternateConfig(draft.alternateWorkdayConfig)
                        ?? sanitizedAlternateConfig(defaultAlternateConfig(for: PlanningItem(id: UUID(), kind: draft.kind, title: cleanTitle, icon: draft.icon, domain: resolvedBucket.domain, bucketID: resolvedBucket.id)))
                    )
                    : nil,
                startDate: draft.startDate,
                endDate: draft.endDate,
                isAllDay: draft.isAllDay,
                startTime: draft.startTime,
                endTime: draft.endTime,
                location: draft.location.trimmingCharacters(in: .whitespacesAndNewlines),
                dueDate: draft.dueDate,
                dueTime: draft.dueTime,
                estimatedMinutes: draft.estimatedMinutes,
                reminderDate: draft.reminderDate,
                reminderTime: draft.reminderTime,
                reminderLeadTime: draft.reminderLeadTime
            )

            items.insert(created, at: 0)
            persistState()
        }

        func updateDisplayName(_ name: String) {
            settings.displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            persistState()
        }

        func markOnboardingCompleted() {
            settings.hasCompletedOnboarding = true
            persistState()
        }

        func reopenOnboarding() {
            settings.hasCompletedOnboarding = false
            persistState()
        }

        func setArchivedPreference(_ enabled: Bool) {
            settings.prefersArchivedVisibleByDefault = enabled
            persistState()
        }

        func clearPersistenceError() {
            persistenceErrorMessage = nil
        }

        func resetToSampleData() {
            let personalDefault = defaultBucket(for: .personal)
            let householdDefault = defaultBucket(for: .household)
            let professionalDefault = defaultBucket(for: .professional)

            items = [
                PlanningItem(id: UUID(), kind: .event, title: "Doctor appointment", domain: .personal, bucketID: personalDefault.id),
                PlanningItem(id: UUID(), kind: .task, title: "Grocery restock", domain: .household, bucketID: householdDefault.id),
                PlanningItem(id: UUID(), kind: .reminder, title: "Send project update", domain: .professional, bucketID: professionalDefault.id)
            ]
        }

        @discardableResult
        func createBudgetCategory(title: String, colorHex: String, monthlyLimit: Double) -> UUID? {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return nil }
            let category = BudgetCategory(
                id: UUID(),
                title: cleanTitle,
                colorHex: colorHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "#64748B" : colorHex,
                monthlyLimit: max(monthlyLimit, 0),
                isArchived: false,
                createdAt: Date()
            )
            budgetCategories.append(category)
            return category.id
        }

        func updateBudgetCategory(id: UUID, title: String, colorHex: String, monthlyLimit: Double) {
            guard let idx = budgetCategories.firstIndex(where: { $0.id == id }) else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty else { return }
            budgetCategories[idx].title = cleanTitle
            budgetCategories[idx].colorHex = colorHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? budgetCategories[idx].colorHex : colorHex
            budgetCategories[idx].monthlyLimit = max(monthlyLimit, 0)
        }

        func setBudgetCategoryArchived(id: UUID, isArchived: Bool) {
            guard let idx = budgetCategories.firstIndex(where: { $0.id == id }) else { return }
            budgetCategories[idx].isArchived = isArchived
        }

        @discardableResult
        func createRecurringBill(title: String, amount: Double, categoryID: UUID, cadence: BudgetBillCadence, dueDay: Int, notes: String) -> UUID? {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty, amount >= 0 else { return nil }
            guard budgetCategories.contains(where: { $0.id == categoryID }) else { return nil }

            let now = Date()
            let bill = BudgetRecurringBill(
                id: UUID(),
                title: cleanTitle,
                amount: amount,
                categoryID: categoryID,
                cadence: cadence,
                dueDay: min(max(dueDay, 1), 31),
                isActive: true,
                notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
                createdAt: now,
                updatedAt: now
            )
            budgetRecurringBills.append(bill)
            return bill.id
        }

        func updateRecurringBill(id: UUID, title: String, amount: Double, categoryID: UUID, cadence: BudgetBillCadence, dueDay: Int, notes: String, isActive: Bool) {
            guard let idx = budgetRecurringBills.firstIndex(where: { $0.id == id }) else { return }
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty, amount >= 0 else { return }
            guard budgetCategories.contains(where: { $0.id == categoryID }) else { return }

            budgetRecurringBills[idx].title = cleanTitle
            budgetRecurringBills[idx].amount = amount
            budgetRecurringBills[idx].categoryID = categoryID
            budgetRecurringBills[idx].cadence = cadence
            budgetRecurringBills[idx].dueDay = min(max(dueDay, 1), 31)
            budgetRecurringBills[idx].notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
            budgetRecurringBills[idx].isActive = isActive
            budgetRecurringBills[idx].updatedAt = Date()
        }

        func deleteRecurringBill(id: UUID) {
            budgetRecurringBills.removeAll { $0.id == id }
        }

        @discardableResult
        func createExpenseRecord(title: String, amount: Double, categoryID: UUID, date: Date, notes: String) -> UUID? {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty, amount >= 0 else { return nil }
            guard budgetCategories.contains(where: { $0.id == categoryID }) else { return nil }

            let record = BudgetExpenseRecord(
                id: UUID(),
                title: cleanTitle,
                amount: amount,
                categoryID: categoryID,
                date: Calendar.current.startOfDay(for: date),
                notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
                createdAt: Date()
            )
            budgetExpenseRecords.insert(record, at: 0)
            return record.id
        }

        func deleteExpenseRecord(id: UUID) {
            budgetExpenseRecords.removeAll { $0.id == id }
        }

        func updateBudgetTargets(monthlySavingsTarget: Double, taxRate: Double) {
            budgetMonthlySavingsTarget = max(monthlySavingsTarget, 0)
            budgetTaxRate = min(max(taxRate, 0), 0.6)
        }

        func budgetPayrollSchedule(for bucketID: UUID) -> BudgetPayrollSchedule {
            if let existing = budgetPayrollScheduleByBucket[bucketID] {
                return sanitizedPayrollSchedule(existing)
            }
            guard let bucket = bucket(for: bucketID) else {
                return BudgetPayrollSchedule()
            }
            return defaultPayrollSchedule(for: bucket)
        }

        func setBudgetPayrollSchedule(for bucketID: UUID, schedule: BudgetPayrollSchedule) {
            budgetPayrollScheduleByBucket[bucketID] = sanitizedPayrollSchedule(schedule)
        }

        func projectedIncome(from start: Date, to end: Date) -> BudgetIncomeProjection {
            let calendar = Calendar.current
            let rangeStart = calendar.startOfDay(for: min(start, end))
            let rangeEnd = calendar.startOfDay(for: max(start, end))
            let workItems = items.filter { item in
                guard item.domain == .professional else { return false }
                guard let bucket = bucket(for: item.bucketID) else { return false }
                return bucket.isJob && bucket.payRate != nil
            }

            var grossIncome = 0.0
            var regularIncome = 0.0
            var overtimeIncome = 0.0
            var totalHours = 0.0
            var overtimeHours = 0.0
            var occurrenceCount = 0

            var hoursByWeekAndBucket: [String: Double] = [:]

            for item in workItems {
                guard let bucket = bucket(for: item.bucketID), let payRate = bucket.payRate else { continue }
                let occurrences = occurrenceDates(for: item, from: rangeStart, to: rangeEnd)
                for occurrenceDate in occurrences {
                    occurrenceCount += 1
                    let occurrenceHours = durationHours(for: item)

                    switch bucket.payPeriod {
                    case .salary:
                        let dailySalary = payRate / 260.0
                        let multiplier = max(occurrenceHours / 8.0, 0.5)
                        let pay = dailySalary * multiplier
                        grossIncome += pay
                        regularIncome += pay

                    case .hourly:
                        let weekStart = startOfWeek(for: occurrenceDate)
                        let weekKey = "\(bucket.id.uuidString)|\(isoDateString(for: weekStart))"
                        let priorHours = hoursByWeekAndBucket[weekKey] ?? 0
                        let weeklyRegularRemaining = max(40.0 - priorHours, 0)
                        let regularHoursForOccurrence = min(occurrenceHours, weeklyRegularRemaining)
                        let overtimeHoursForOccurrence = max(occurrenceHours - regularHoursForOccurrence, 0)

                        let regularPay = regularHoursForOccurrence * payRate
                        let overtimePay = overtimeHoursForOccurrence * payRate * 1.5

                        grossIncome += regularPay + overtimePay
                        regularIncome += regularPay
                        overtimeIncome += overtimePay
                        totalHours += occurrenceHours
                        overtimeHours += overtimeHoursForOccurrence
                        hoursByWeekAndBucket[weekKey] = priorHours + occurrenceHours
                    }
                }
            }

            return BudgetIncomeProjection(
                grossIncome: grossIncome,
                regularIncome: regularIncome,
                overtimeIncome: overtimeIncome,
                totalHours: totalHours,
                overtimeHours: overtimeHours,
                occurrenceCount: occurrenceCount
            )
        }

        func projectedPaychecks(weeksAhead: Int, referenceDate: Date = Date()) -> [BudgetPaycheckProjection] {
            let calendar = Calendar.current
            let horizon = max(weeksAhead, 1)
            let rangeStart = calendar.startOfDay(for: referenceDate)
            let rangeEnd = calendar.date(byAdding: .day, value: (horizon * 7) - 1, to: rangeStart) ?? rangeStart
            let jobBuckets = buckets.filter { $0.domain == .professional && $0.isJob && ($0.payRate ?? 0) > 0 }

            var projections: [BudgetPaycheckProjection] = []

            for bucket in jobBuckets {
                let schedule = budgetPayrollSchedule(for: bucket.id)
                let payDates = payDates(for: schedule, from: rangeStart, to: rangeEnd)

                for payDate in payDates {
                    let (periodStart, periodEnd) = payPeriodBounds(for: schedule, payDate: payDate)
                    let gross: Double

                    if bucket.payPeriod == .salary {
                        gross = (bucket.payRate ?? 0) / salaryPaymentsPerYear(for: schedule)
                    } else {
                        gross = projectedIncomeForBucket(bucketID: bucket.id, from: periodStart, to: periodEnd)
                    }

                    guard gross > 0 else { continue }

                    projections.append(
                        BudgetPaycheckProjection(
                            id: UUID(),
                            bucketID: bucket.id,
                            bucketName: bucket.name,
                            periodStart: periodStart,
                            periodEnd: periodEnd,
                            payDate: payDate,
                            gross: gross,
                            net: gross * (1 - budgetTaxRate)
                        )
                    )
                }
            }

            return projections.sorted { lhs, rhs in
                if lhs.payDate != rhs.payDate {
                    return lhs.payDate < rhs.payDate
                }
                return lhs.bucketName.localizedCaseInsensitiveCompare(rhs.bucketName) == .orderedAscending
            }
        }

        func projectedRecurringExpenseTotal(from start: Date, to end: Date) -> Double {
            recurringBillOccurrences(from: start, to: end).reduce(0) { partial, entry in
                partial + entry.amount
            }
        }

        func loggedExpenseTotal(from start: Date, to end: Date) -> Double {
            let rangeStart = Calendar.current.startOfDay(for: min(start, end))
            let rangeEnd = Calendar.current.startOfDay(for: max(start, end))
            return budgetExpenseRecords.reduce(0) { partial, record in
                let day = Calendar.current.startOfDay(for: record.date)
                guard day >= rangeStart && day <= rangeEnd else { return partial }
                return partial + record.amount
            }
        }

        func projectedCashFlow(days: Int, referenceDate: Date = Date()) -> BudgetCashFlowProjection {
            let safeDays = max(days, 1)
            let start = Calendar.current.startOfDay(for: referenceDate)
            let end = Calendar.current.date(byAdding: .day, value: safeDays - 1, to: start) ?? start

            let income = projectedIncome(from: start, to: end).grossIncome
            let recurring = projectedRecurringExpenseTotal(from: start, to: end)
            let oneTime = loggedExpenseTotal(from: start, to: end)
            let expenses = recurring + oneTime

            return BudgetCashFlowProjection(
                projectedIncome: income,
                projectedExpenses: expenses,
                net: income - expenses
            )
        }

        func monthlyVariance(referenceDate: Date = Date()) -> BudgetVarianceSnapshot {
            let calendar = Calendar.current
            let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: referenceDate)) ?? calendar.startOfDay(for: referenceDate)
            let monthRange = calendar.range(of: .day, in: .month, for: monthStart)
            let monthEndDay = monthRange?.count ?? 30
            let monthEnd = calendar.date(byAdding: .day, value: monthEndDay - 1, to: monthStart) ?? monthStart

            let projectedIncomeMonth = projectedIncome(from: monthStart, to: monthEnd).grossIncome
            let actualIncomeToDate = projectedIncome(from: monthStart, to: referenceDate).grossIncome

            let projectedSpendMonth = projectedRecurringExpenseTotal(from: monthStart, to: monthEnd) + loggedExpenseTotal(from: monthStart, to: monthEnd)
            let actualSpendToDate = loggedExpenseTotal(from: monthStart, to: referenceDate)

            return BudgetVarianceSnapshot(
                projectedIncome: projectedIncomeMonth,
                actualIncomeToDate: actualIncomeToDate,
                projectedSpend: projectedSpendMonth,
                actualSpendToDate: actualSpendToDate
            )
        }

        func overtimeImpact(from start: Date, to end: Date) -> BudgetOvertimeImpact {
            let projection = projectedIncome(from: start, to: end)
            return BudgetOvertimeImpact(
                regularIncome: projection.regularIncome,
                overtimeIncome: projection.overtimeIncome,
                regularHours: max(projection.totalHours - projection.overtimeHours, 0),
                overtimeHours: projection.overtimeHours
            )
        }

        func recurringBillOccurrences(from start: Date, to end: Date) -> [(date: Date, amount: Double)] {
            let calendar = Calendar.current
            let rangeStart = calendar.startOfDay(for: min(start, end))
            let rangeEnd = calendar.startOfDay(for: max(start, end))
            var occurrences: [(date: Date, amount: Double)] = []

            for bill in budgetRecurringBills where bill.isActive {
                var cursor = rangeStart
                while cursor <= rangeEnd {
                    if shouldEmitBill(bill, on: cursor) {
                        occurrences.append((date: cursor, amount: bill.amount))
                    }
                    guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                    cursor = next
                }
            }

            return occurrences.sorted { $0.date < $1.date }
        }

        private func defaultPayrollSchedule(for bucket: PlannerBucket) -> BudgetPayrollSchedule {
            switch bucket.payPeriod {
            case .salary:
                return BudgetPayrollSchedule(cadence: .biweekly, payWeekday: 6)
            case .hourly:
                return BudgetPayrollSchedule(cadence: .weekly, payWeekday: 6)
            }
        }

        private func sanitizedPayrollSchedule(_ schedule: BudgetPayrollSchedule) -> BudgetPayrollSchedule {
            Self.sanitizedPayrollScheduleStatic(schedule)
        }

        private func salaryPaymentsPerYear(for schedule: BudgetPayrollSchedule) -> Double {
            switch schedule.cadence {
            case .weekly:
                return 52
            case .biweekly:
                return 26
            case .semimonthly:
                return 24
            case .monthly, .customDayOfMonth:
                return 12
            }
        }

        private func payDates(for schedule: BudgetPayrollSchedule, from start: Date, to end: Date) -> [Date] {
            let calendar = Calendar.current
            let rangeStart = calendar.startOfDay(for: min(start, end))
            let rangeEnd = calendar.startOfDay(for: max(start, end))
            let normalized = sanitizedPayrollSchedule(schedule)

            switch normalized.cadence {
            case .weekly:
                guard let first = firstDate(onOrAfter: rangeStart, matchingWeekday: normalized.payWeekday) else { return [] }
                var dates: [Date] = []
                var cursor = first
                while cursor <= rangeEnd {
                    dates.append(cursor)
                    guard let next = calendar.date(byAdding: .day, value: 7, to: cursor) else { break }
                    cursor = next
                }
                return dates

            case .biweekly:
                let anchor = biweeklyAnchorDate(for: normalized, referenceStart: rangeStart)
                guard let first = firstDate(onOrAfter: rangeStart, onIntervalDays: 14, anchoredAt: anchor) else { return [] }
                var dates: [Date] = []
                var cursor = first
                while cursor <= rangeEnd {
                    dates.append(cursor)
                    guard let next = calendar.date(byAdding: .day, value: 14, to: cursor) else { break }
                    cursor = next
                }
                return dates

            case .monthly, .customDayOfMonth:
                return monthlyPayDates(day: normalized.dayOfMonth, from: rangeStart, to: rangeEnd)

            case .semimonthly:
                let firstDay = min(normalized.dayOfMonth, normalized.secondDayOfMonth ?? normalized.dayOfMonth)
                let secondDay = max(normalized.dayOfMonth, normalized.secondDayOfMonth ?? normalized.dayOfMonth)
                let firstDates = monthlyPayDates(day: firstDay, from: rangeStart, to: rangeEnd)
                let secondDates = monthlyPayDates(day: secondDay, from: rangeStart, to: rangeEnd)
                return Array(Set(firstDates + secondDates)).sorted()
            }
        }

        private func payPeriodBounds(for schedule: BudgetPayrollSchedule, payDate: Date) -> (Date, Date) {
            let calendar = Calendar.current
            let normalizedPayDate = calendar.startOfDay(for: payDate)
            let normalized = sanitizedPayrollSchedule(schedule)

            switch normalized.cadence {
            case .weekly:
                let start = calendar.date(byAdding: .day, value: -6, to: normalizedPayDate) ?? normalizedPayDate
                return (start, normalizedPayDate)

            case .biweekly:
                let start = calendar.date(byAdding: .day, value: -13, to: normalizedPayDate) ?? normalizedPayDate
                return (start, normalizedPayDate)

            case .monthly, .customDayOfMonth:
                let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: normalizedPayDate)) ?? normalizedPayDate
                return (monthStart, normalizedPayDate)

            case .semimonthly:
                let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: normalizedPayDate)) ?? normalizedPayDate
                let firstDay = min(normalized.dayOfMonth, normalized.secondDayOfMonth ?? normalized.dayOfMonth)
                let secondDay = max(normalized.dayOfMonth, normalized.secondDayOfMonth ?? normalized.dayOfMonth)
                let payDay = calendar.component(.day, from: normalizedPayDate)

                if payDay <= firstDay {
                    return (monthStart, normalizedPayDate)
                }

                if payDay >= secondDay {
                    let start = calendar.date(byAdding: .day, value: firstDay, to: monthStart) ?? monthStart
                    return (start, normalizedPayDate)
                }

                return (monthStart, normalizedPayDate)
            }
        }

        private func biweeklyAnchorDate(for schedule: BudgetPayrollSchedule, referenceStart: Date) -> Date {
            let calendar = Calendar.current

            if let anchorISO = schedule.anchorDateISO,
               let anchorDate = Self.isoDateFormatter.date(from: anchorISO) {
                return calendar.startOfDay(for: anchorDate)
            }

            return firstDate(onOrAfter: referenceStart, matchingWeekday: schedule.payWeekday) ?? referenceStart
        }

        private func firstDate(onOrAfter start: Date, matchingWeekday weekday: Int) -> Date? {
            let calendar = Calendar.current
            let startDay = calendar.startOfDay(for: start)
            let startWeekday = calendar.component(.weekday, from: startDay)
            let delta = (weekday - startWeekday + 7) % 7
            return calendar.date(byAdding: .day, value: delta, to: startDay)
        }

        private func firstDate(onOrAfter start: Date, onIntervalDays interval: Int, anchoredAt anchor: Date) -> Date? {
            let calendar = Calendar.current
            let startDay = calendar.startOfDay(for: start)
            let anchorDay = calendar.startOfDay(for: anchor)

            if anchorDay >= startDay {
                return anchorDay
            }

            let days = calendar.dateComponents([.day], from: anchorDay, to: startDay).day ?? 0
            let remainder = days % interval
            let bump = remainder == 0 ? 0 : interval - remainder
            return calendar.date(byAdding: .day, value: bump, to: startDay)
        }

        private func monthlyPayDates(day: Int, from start: Date, to end: Date) -> [Date] {
            let calendar = Calendar.current
            let rangeStart = calendar.startOfDay(for: min(start, end))
            let rangeEnd = calendar.startOfDay(for: max(start, end))

            guard let startMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: rangeStart)),
                  let endMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: rangeEnd)) else {
                return []
            }

            var dates: [Date] = []
            var cursor = startMonth

            while cursor <= endMonth {
                let year = calendar.component(.year, from: cursor)
                let month = calendar.component(.month, from: cursor)
                if let date = date(year: year, month: month, day: day), date >= rangeStart, date <= rangeEnd {
                    dates.append(date)
                }
                guard let nextMonth = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
                cursor = nextMonth
            }

            return dates
        }

        private func date(year: Int, month: Int, day: Int) -> Date? {
            let calendar = Calendar.current
            guard let monthStart = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
                  let dayRange = calendar.range(of: .day, in: .month, for: monthStart) else {
                return nil
            }

            let safeDay = min(max(day, dayRange.lowerBound), dayRange.upperBound - 1)
            return calendar.date(from: DateComponents(year: year, month: month, day: safeDay))
        }

        private func projectedIncomeForBucket(bucketID: UUID, from start: Date, to end: Date) -> Double {
            let rangeStart = Calendar.current.startOfDay(for: min(start, end))
            let rangeEnd = Calendar.current.startOfDay(for: max(start, end))
            let bucketItems = items.filter { $0.bucketID == bucketID && $0.domain == .professional }
            var gross = 0.0

            for item in bucketItems {
                guard let bucket = bucket(for: item.bucketID), let payRate = bucket.payRate else { continue }
                let occurrences = occurrenceDates(for: item, from: rangeStart, to: rangeEnd)
                for _ in occurrences {
                    if bucket.payPeriod == .salary {
                        gross += payRate / 260.0
                    } else {
                        gross += durationHours(for: item) * payRate
                    }
                }
            }
            return gross
        }

        private func durationHours(for item: PlanningItem) -> Double {
            switch item.kind {
            case .event:
                return Double(eventDurationMinutes(for: item)) / 60.0
            case .task:
                return Double(item.estimatedMinutes ?? 60) / 60.0
            case .reminder:
                return 0.25
            }
        }

        private func startOfWeek(for date: Date) -> Date {
            let calendar = Calendar.current
            let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
            return calendar.date(from: components) ?? calendar.startOfDay(for: date)
        }

        private func shouldEmitBill(_ bill: BudgetRecurringBill, on date: Date) -> Bool {
            let calendar = Calendar.current
            let day = calendar.component(.day, from: date)

            switch bill.cadence {
            case .monthly:
                return day == min(max(bill.dueDay, 1), 31)
            case .biweekly:
                let weekday = calendar.component(.weekday, from: date)
                guard weekday == 6 else { return false }
                let weekOfYear = calendar.component(.weekOfYear, from: date)
                return weekOfYear.isMultiple(of: 2)
            case .weekly:
                return calendar.component(.weekday, from: date) == 6
            }
        }

        private func sanitizedSubItems(_ subItems: [PlanningSubItem]) -> [PlanningSubItem] {
            subItems.compactMap { subItem in
                let cleanTitle = subItem.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanTitle.isEmpty else { return nil }
                return PlanningSubItem(
                    id: subItem.id,
                    kind: subItem.kind,
                    title: cleanTitle,
                    isCompleted: subItem.isCompleted,
                    sourceApp: subItem.sourceApp,
                    sourceEntryID: subItem.sourceEntryID,
                    linkedItemID: subItem.linkedItemID,
                    urlString: subItem.urlString
                )
            }
        }

        private func sanitizedAlternateConfig(_ config: AlternateWorkdayConfig?) -> AlternateWorkdayConfig? {
            guard var config else { return nil }

            config.itemHolidayPatterns = sanitizedHolidayPatterns(config.itemHolidayPatterns)

            config.skippedOccurrenceDateISOs = Array(Set(config.skippedOccurrenceDateISOs.filter { Self.isoDateFormatter.date(from: $0) != nil })).sorted()
            config.forcedIncludeDateISOs = Array(Set(config.forcedIncludeDateISOs.filter { Self.isoDateFormatter.date(from: $0) != nil })).sorted()

            if let until = config.untilDateISO, Self.isoDateFormatter.date(from: until) == nil {
                config.untilDateISO = nil
            }

            return config
        }

        private func sanitizedHolidayPatterns(_ patterns: [WorkHolidayPattern]) -> [WorkHolidayPattern] {
            patterns.compactMap { pattern in
                switch pattern.kind {
                case .specificDate:
                    guard let iso = pattern.specificDateISO, Self.isoDateFormatter.date(from: iso) != nil else { return nil }
                    var valid = pattern
                    valid.specificDateISO = iso
                    valid.recurringMonth = nil
                    valid.recurringDay = nil
                    valid.usHoliday = nil
                    return valid

                case .recurringMonthDay:
                    guard let month = pattern.recurringMonth, let day = pattern.recurringDay else { return nil }
                    guard (1...12).contains(month), (1...31).contains(day) else { return nil }
                    var valid = pattern
                    valid.specificDateISO = nil
                    valid.recurringMonth = month
                    valid.recurringDay = day
                    valid.usHoliday = nil
                    return valid

                case .predefinedUSHoliday:
                    guard let holiday = pattern.usHoliday else { return nil }
                    var valid = pattern
                    valid.specificDateISO = nil
                    valid.recurringMonth = nil
                    valid.recurringDay = nil
                    valid.usHoliday = holiday
                    return valid
                }
            }
        }

        private func applyEventSchedule(index: Int, start: Date, durationMinutes: Int) {
            let safeDuration = max(durationMinutes, 30)
            let end = Calendar.current.date(byAdding: .minute, value: safeDuration, to: start) ?? start

            items[index].isAllDay = false
            items[index].startDate = dayOnly(from: start)
            items[index].startTime = timeOnly(from: start)
            items[index].endDate = dayOnly(from: end)
            items[index].endTime = timeOnly(from: end)
        }

        private func eventDurationMinutes(for item: PlanningItem) -> Int {
            guard let start = combinedDate(date: item.startDate, time: item.startTime) else { return 60 }
            guard let end = combinedDate(date: item.endDate ?? item.startDate, time: item.endTime) else { return 60 }
            return max(Int(end.timeIntervalSince(start) / 60), 30)
        }

        private func combinedDate(date: Date?, time: Date?) -> Date? {
            guard let date else { return nil }
            let calendar = Calendar.current
            var components = calendar.dateComponents([.year, .month, .day], from: date)

            if let time {
                let timeComponents = calendar.dateComponents([.hour, .minute], from: time)
                components.hour = timeComponents.hour ?? 0
                components.minute = timeComponents.minute ?? 0
            } else {
                components.hour = 0
                components.minute = 0
            }

            return calendar.date(from: components)
        }

        private func dayOnly(from date: Date) -> Date {
            Calendar.current.startOfDay(for: date)
        }

        private func timeOnly(from date: Date) -> Date {
            let calendar = Calendar.current
            let components = calendar.dateComponents([.hour, .minute], from: date)
            return calendar.date(from: components) ?? date
        }

        private func bindPersistence() {
            Publishers.MergeMany(
                $buckets.map { _ in () }.eraseToAnyPublisher(),
                $items.map { _ in () }.eraseToAnyPublisher(),
                $journalEntries.map { _ in () }.eraseToAnyPublisher(),
                $settings.map { _ in () }.eraseToAnyPublisher(),
                $mapStopOrderByItem.map { _ in () }.eraseToAnyPublisher(),
                $dynamicMapFavorites.map { _ in () }.eraseToAnyPublisher(),
                $dynamicMapSavedRoutes.map { _ in () }.eraseToAnyPublisher(),
                $budgetCategories.map { _ in () }.eraseToAnyPublisher(),
                $budgetRecurringBills.map { _ in () }.eraseToAnyPublisher(),
                $budgetExpenseRecords.map { _ in () }.eraseToAnyPublisher(),
                $budgetPayrollScheduleByBucket.map { _ in () }.eraseToAnyPublisher(),
                $budgetMonthlySavingsTarget.map { _ in () }.eraseToAnyPublisher(),
                $budgetTaxRate.map { _ in () }.eraseToAnyPublisher()
            )
                .dropFirst()
                .sink { [weak self] _ in
                    self?.invalidateOccurrenceCache()
                    self?.persistState()
                }
                .store(in: &cancellables)
        }

        private func invalidateOccurrenceCache() {
            occurrenceCache.removeAll()
        }

        func isDateHolidayForItem(_ date: Date, item: PlanningItem) -> Bool {
            guard let bucket = bucket(for: item.bucketID), bucket.domain == .professional, bucket.isJob else { return false }
            return isHoliday(date: date, patterns: bucket.jobHolidayPatterns)
        }

        func isHolidayDate(_ date: Date, patterns: [WorkHolidayPattern]) -> Bool {
            isHoliday(date: date, patterns: patterns)
        }

        func isOccurrenceSkipped(item: PlanningItem, on date: Date) -> Bool {
            guard let config = item.alternateWorkdayConfig else { return false }
            let iso = isoDateString(for: date)
            return config.skippedOccurrenceDateISOs.contains(iso)
        }

        func skipOccurrence(itemID: UUID, date: Date) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].repeatRule == .alternateWorkdays else { return }
            var config = items[idx].alternateWorkdayConfig ?? defaultAlternateConfig(for: items[idx])
            let iso = isoDateString(for: date)
            if !config.skippedOccurrenceDateISOs.contains(iso) {
                config.skippedOccurrenceDateISOs.append(iso)
                items[idx].alternateWorkdayConfig = config
            }
        }

        func unskipOccurrence(itemID: UUID, date: Date) {
            guard let idx = items.firstIndex(where: { $0.id == itemID }) else { return }
            guard items[idx].repeatRule == .alternateWorkdays else { return }
            guard var config = items[idx].alternateWorkdayConfig else { return }
            let iso = isoDateString(for: date)
            config.skippedOccurrenceDateISOs.removeAll { $0 == iso }
            items[idx].alternateWorkdayConfig = config
        }

        func occurrenceDates(for item: PlanningItem, from start: Date, to end: Date) -> [Date] {
            let normalizedStart = Calendar.current.startOfDay(for: min(start, end))
            let normalizedEnd = Calendar.current.startOfDay(for: max(start, end))
            let rangeKey = "\(isoDateString(for: normalizedStart))|\(isoDateString(for: normalizedEnd))"

            if let cached = occurrenceCache[rangeKey]?[item.id] {
                return cached
            }

            let resolved = computeOccurrenceDates(for: item, from: normalizedStart, to: normalizedEnd)
            if occurrenceCache[rangeKey] == nil {
                occurrenceCache[rangeKey] = [:]
            }
            occurrenceCache[rangeKey]?[item.id] = resolved
            return resolved
        }

        func occurs(_ item: PlanningItem, on date: Date) -> Bool {
            let normalized = Calendar.current.startOfDay(for: date)
            return occurrenceDates(for: item, from: normalized, to: normalized).isEmpty == false
        }

        func occurrenceStartDate(for item: PlanningItem, on date: Date) -> Date? {
            guard occurs(item, on: date) else { return nil }
            return mergeDateAndTime(for: item, at: date)
        }

        private func computeOccurrenceDates(for item: PlanningItem, from start: Date, to end: Date) -> [Date] {
            guard let anchor = anchorDate(for: item) else { return [] }
            let calendar = Calendar.current
            let normalizedAnchor = calendar.startOfDay(for: anchor)
            if normalizedAnchor > end { return [] }

            switch item.repeatRule {
            case .none:
                let occurrenceDate = calendar.startOfDay(for: normalizedAnchor)
                return (occurrenceDate >= start && occurrenceDate <= end) ? [occurrenceDate] : []

            case .daily:
                var result: [Date] = []
                var cursor = max(start, normalizedAnchor)
                while cursor <= end {
                    result.append(cursor)
                    guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                    cursor = next
                }
                return result

            case .weekdays:
                var result: [Date] = []
                var cursor = max(start, normalizedAnchor)
                while cursor <= end {
                    if !calendar.isDateInWeekend(cursor) {
                        result.append(cursor)
                    }
                    guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                    cursor = next
                }
                return result

            case .weekly:
                var result: [Date] = []
                var cursor = normalizedAnchor
                while cursor < start {
                    guard let next = calendar.date(byAdding: .day, value: 7, to: cursor) else { break }
                    cursor = next
                }
                while cursor <= end {
                    result.append(cursor)
                    guard let next = calendar.date(byAdding: .day, value: 7, to: cursor) else { break }
                    cursor = next
                }
                return result

            case .monthly:
                var result: [Date] = []
                var cursor = normalizedAnchor
                while cursor < start {
                    guard let next = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
                    cursor = next
                }
                while cursor <= end {
                    result.append(cursor)
                    guard let next = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
                    cursor = next
                }
                return result

            case .alternateWorkdays:
                guard let bucket = bucket(for: item.bucketID), bucket.domain == .professional, bucket.isJob else {
                    return []
                }

                var config = item.alternateWorkdayConfig ?? defaultAlternateConfig(for: item)
                if item.alternateWorkdayConfig == nil {
                    config.startingPattern = autoPattern(for: normalizedAnchor)
                }

                var result: [Date] = []
                var cursor = max(start, normalizedAnchor)
                while cursor <= end {
                    let weekday = calendar.component(.weekday, from: cursor)
                    if weekday >= 2 && weekday <= 6 {
                        let iso = isoDateString(for: cursor)
                        // Only skip adding occurrences after untilDateISO, but do not break the loop early
                        if let untilISO = config.untilDateISO, iso > untilISO {
                            // Do not add occurrences after until, but keep looping to cover the full requested range
                            // (so that weeks overlapping the until date still show the last valid occurrence)
                        } else {
                            let forcedInclude = config.forcedIncludeDateISOs.contains(iso)
                            let skipped = config.skippedOccurrenceDateISOs.contains(iso)
                            let patternForDate = patternGroup(for: cursor, anchoredAt: normalizedAnchor)
                            let matchesPattern = patternForDate == config.startingPattern
                            let excludedByHoliday = config.respectsHolidayExclusions && isHoliday(date: cursor, patterns: bucket.jobHolidayPatterns)

                            if matchesPattern && !skipped && (!excludedByHoliday || forcedInclude) {
                                result.append(cursor)
                            }
                        }
                    }

                    guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                    cursor = next
                }
                return result
            }
        }

        private func anchorDate(for item: PlanningItem) -> Date? {
            switch item.kind {
            case .event:
                return item.startDate ?? item.endDate
            case .task:
                return item.dueDate
            case .reminder:
                return item.reminderDate
            }
        }

        private func mergeDateAndTime(for item: PlanningItem, at date: Date) -> Date? {
            switch item.kind {
            case .event:
                return merge(date: date, time: item.startTime, defaultHour: 9)
            case .task:
                return merge(date: date, time: item.dueTime, defaultHour: 11)
            case .reminder:
                return merge(date: date, time: item.reminderTime, defaultHour: 16)
            }
        }

        private func merge(date: Date, time: Date?, defaultHour: Int) -> Date? {
            let calendar = Calendar.current
            var dateComponents = calendar.dateComponents([.year, .month, .day], from: date)

            if let time {
                let timeComponents = calendar.dateComponents([.hour, .minute], from: time)
                dateComponents.hour = timeComponents.hour ?? defaultHour
                dateComponents.minute = timeComponents.minute ?? 0
            } else {
                dateComponents.hour = defaultHour
                dateComponents.minute = 0
            }

            return calendar.date(from: dateComponents)
        }

        private func defaultAlternateConfig(for item: PlanningItem) -> AlternateWorkdayConfig {
            AlternateWorkdayConfig(startingPattern: autoPattern(for: anchorDate(for: item) ?? Date()))
        }

        private func autoPattern(for date: Date) -> ABPattern {
            patternGroup(for: date, anchoredAt: date)
        }

        private func patternGroup(for date: Date, anchoredAt anchor: Date) -> ABPattern {
            guard let workdayIndex = workdayIndex(from: anchor, to: date) else {
                return .a
            }
            return workdayIndex.isMultiple(of: 2) ? .a : .b
        }

        private func workdayIndex(from anchor: Date, to date: Date) -> Int? {
            let calendar = Calendar.current
            let target = calendar.startOfDay(for: date)
            var cursor = firstWorkday(onOrAfter: anchor)

            if target < cursor || !isWorkday(target) {
                return nil
            }

            var index = 0
            while cursor < target {
                guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { return nil }
                cursor = next
                if isWorkday(cursor) {
                    index += 1
                }
            }

            return index
        }

        private func firstWorkday(onOrAfter date: Date) -> Date {
            let calendar = Calendar.current
            var cursor = calendar.startOfDay(for: date)
            while !isWorkday(cursor) {
                guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                cursor = next
            }
            return cursor
        }

        private func isWorkday(_ date: Date) -> Bool {
            let weekday = Calendar.current.component(.weekday, from: date)
            return weekday >= 2 && weekday <= 6
        }

        private func isHoliday(date: Date, patterns: [WorkHolidayPattern]) -> Bool {
            let calendar = Calendar.current
            let month = calendar.component(.month, from: date)
            let day = calendar.component(.day, from: date)
            let year = calendar.component(.year, from: date)
            let targetISO = isoDateString(for: date)

            for pattern in patterns where pattern.isActive {
                switch pattern.kind {
                case .specificDate:
                    if pattern.specificDateISO == targetISO {
                        return true
                    }

                case .recurringMonthDay:
                    if pattern.recurringMonth == month && pattern.recurringDay == day {
                        return true
                    }

                case .predefinedUSHoliday:
                    if let holiday = pattern.usHoliday,
                       let holidayDate = usHolidayDate(holiday, year: year),
                       calendar.isDate(holidayDate, inSameDayAs: date) {
                        return true
                    }
                }
            }

            return false
        }

        private func usHolidayDate(_ holiday: USHoliday, year: Int) -> Date? {
            let calendar = Calendar.current
            switch holiday {
            case .newYearsDay:
                return calendar.date(from: DateComponents(year: year, month: 1, day: 1))
            case .independenceDay:
                return calendar.date(from: DateComponents(year: year, month: 7, day: 4))
            case .christmasDay:
                return calendar.date(from: DateComponents(year: year, month: 12, day: 25))
            case .memorialDay:
                return nthWeekday(weekday: 2, occurrence: -1, month: 5, year: year)
            case .laborDay:
                return nthWeekday(weekday: 2, occurrence: 1, month: 9, year: year)
            case .thanksgivingDay:
                return nthWeekday(weekday: 5, occurrence: 4, month: 11, year: year)
            }
        }

        private func nthWeekday(weekday: Int, occurrence: Int, month: Int, year: Int) -> Date? {
            let calendar = Calendar.current
            if occurrence > 0 {
                let firstOfMonth = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
                let firstWeekday = calendar.component(.weekday, from: firstOfMonth)
                let delta = (weekday - firstWeekday + 7) % 7
                let day = 1 + delta + (occurrence - 1) * 7
                return calendar.date(from: DateComponents(year: year, month: month, day: day))
            }

            guard let range = calendar.range(of: .day, in: .month, for: calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()),
                  let lastDay = range.last,
                  let lastDate = calendar.date(from: DateComponents(year: year, month: month, day: lastDay)) else {
                return nil
            }

            let lastWeekday = calendar.component(.weekday, from: lastDate)
            let delta = (lastWeekday - weekday + 7) % 7
            let day = lastDay - delta
            return calendar.date(from: DateComponents(year: year, month: month, day: day))
        }

        private func isoDateString(for date: Date) -> String {
            Self.isoDateFormatter.string(from: date)
        }

        private static let isoDateFormatter: DateFormatter = {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter
        }()

        private func persistState() {
            let state = PersistedState(
                buckets: buckets,
                items: items,
                journalEntries: journalEntries,
                settings: settings,
                mapStopOrderByItem: mapStopOrderByItem,
                dynamicMapFavorites: dynamicMapFavorites,
                dynamicMapSavedRoutes: dynamicMapSavedRoutes,
                budgetCategories: budgetCategories,
                budgetRecurringBills: budgetRecurringBills,
                budgetExpenseRecords: budgetExpenseRecords,
                budgetPayrollScheduleByBucket: budgetPayrollScheduleByBucket,
                budgetMonthlySavingsTarget: budgetMonthlySavingsTarget,
                budgetTaxRate: budgetTaxRate
            )
            do {
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                let data = try encoder.encode(state)
                try data.write(to: Self.storageURL(), options: [.atomic])
                if persistenceErrorMessage != nil {
                    persistenceErrorMessage = nil
                }
            } catch {
                persistenceErrorMessage = error.localizedDescription
                print("PlannerStore persistence failed: \(error)")
            }
        }

        private static func loadState(defaultIDs: [BucketDomain: UUID]) -> PersistedState? {
            let decoder = JSONDecoder()
            let activeURL = storageURL()

            for candidateURL in storageCandidateURLs() {
                guard FileManager.default.fileExists(atPath: candidateURL.path) else { continue }
                guard let data = try? Data(contentsOf: candidateURL) else { continue }

                if let current = try? decoder.decode(PersistedState.self, from: data) {
                    if candidateURL != activeURL {
                        try? data.write(to: activeURL, options: [.atomic])
                    }
                    return normalizeLoadedState(current, defaultIDs: defaultIDs)
                }

                if let legacyV1 = try? decoder.decode(LegacyPersistedStateV1.self, from: data) {
                    let upgraded = PersistedState(
                        buckets: legacyV1.buckets,
                        items: legacyV1.items,
                        journalEntries: [],
                        settings: .default,
                        mapStopOrderByItem: [:],
                        dynamicMapFavorites: [],
                        dynamicMapSavedRoutes: [],
                        budgetCategories: defaultBudgetCategories(),
                        budgetRecurringBills: [],
                        budgetExpenseRecords: [],
                        budgetPayrollScheduleByBucket: [:],
                        budgetMonthlySavingsTarget: 500,
                        budgetTaxRate: 0.22
                    )
                    if candidateURL != activeURL, let upgradedData = try? JSONEncoder().encode(upgraded) {
                        try? upgradedData.write(to: activeURL, options: [.atomic])
                    }
                    return normalizeLoadedState(upgraded, defaultIDs: defaultIDs)
                }
            }

            return nil
        }

        private static func normalizeLoadedState(_ state: PersistedState, defaultIDs: [BucketDomain: UUID]) -> PersistedState {
            var normalizedBuckets = deduplicated(state.buckets)
            var normalizedItems = deduplicated(state.items)
            var normalizedJournalEntries = deduplicated(state.journalEntries)
            let activeDefaultIDs = Set(defaultIDs.values)

            for domain in BucketDomain.allCases {
                guard let expectedID = defaultIDs[domain] else { continue }

                if let idx = normalizedBuckets.firstIndex(where: { $0.id == expectedID }) {
                    normalizedBuckets[idx].domain = domain
                    normalizedBuckets[idx].isDefault = true
                    normalizedBuckets[idx].isArchived = false
                    if normalizedBuckets[idx].name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        normalizedBuckets[idx].name = "General"
                    }
                    if normalizedBuckets[idx].icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        normalizedBuckets[idx].icon = defaultIcon(for: domain)
                    }
                    if normalizedBuckets[idx].colorHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        normalizedBuckets[idx].colorHex = defaultColorHex(for: domain)
                    }
                    if normalizedBuckets[idx].detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        normalizedBuckets[idx].detail = "Default \(domain.title.lowercased()) bucket"
                    }
                } else {
                    normalizedBuckets.append(
                        PlannerBucket(
                            id: expectedID,
                            domain: domain,
                            name: "General",
                            colorHex: defaultColorHex(for: domain),
                            icon: defaultIcon(for: domain),
                            detail: "Default \(domain.title.lowercased()) bucket",
                            isArchived: false,
                            isDefault: true
                        )
                    )
                }
            }

            normalizedBuckets = normalizedBuckets.map {
                normalizedBucket($0, activeDefaultIDs: activeDefaultIDs)
            }

            normalizedJournalEntries = normalizedJournalEntries.compactMap { entry in
                var clean = entry
                let cleanTitle = entry.title.trimmingCharacters(in: .whitespacesAndNewlines)
                let cleanBody = entry.body.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanTitle.isEmpty || !cleanBody.isEmpty else { return nil }
                clean.title = cleanTitle.isEmpty ? "Untitled Entry" : cleanTitle
                clean.body = cleanBody
                if clean.updatedAt < clean.createdAt {
                    clean.updatedAt = clean.createdAt
                }
                return clean
            }

            let bucketByID = Dictionary(uniqueKeysWithValues: normalizedBuckets.map { ($0.id, $0) })
            normalizedItems = normalizedItems.map { item in
                normalizedItem(item, bucketByID: bucketByID, defaultIDs: defaultIDs)
            }

            let validItemIDs: Set<UUID> = Set(normalizedItems.map { $0.id })
            let normalizedMapStopOrder: [UUID: [UUID]] = normalizedMapStopOrderByItem(state.mapStopOrderByItem, validItemIDs: validItemIDs)

            let normalizedFavorites: [DynamicMapFavoriteLocation] = deduplicated(state.dynamicMapFavorites).compactMap { favorite in
                var clean = favorite
                clean.title = favorite.title.trimmingCharacters(in: .whitespacesAndNewlines)
                clean.subtitle = favorite.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
                clean.locationText = favorite.locationText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !clean.title.isEmpty, !clean.locationText.isEmpty else { return nil }
                return clean
            }

            let normalizedRoutes: [DynamicMapSavedRoute] = deduplicated(state.dynamicMapSavedRoutes).compactMap { route in
                var clean = route
                let cleanTitle = route.title.trimmingCharacters(in: .whitespacesAndNewlines)
                clean.title = cleanTitle.isEmpty ? "Saved Route" : cleanTitle
                var seenSourceIDs = Set<String>()
                clean.orderedSourceIDs = route.orderedSourceIDs
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty && seenSourceIDs.insert($0).inserted }
                guard clean.orderedSourceIDs.count >= 2 else { return nil }
                if clean.updatedAt < clean.createdAt {
                    clean.updatedAt = clean.createdAt
                }
                return clean
            }

            let normalizedBudgetCategories: [BudgetCategory] = {
                let cleaned = deduplicated(state.budgetCategories).compactMap { category -> BudgetCategory? in
                    var normalized = category
                    normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !normalized.title.isEmpty else { return nil }
                    if normalized.monthlyLimit < 0 {
                        normalized.monthlyLimit = 0
                    }
                    if normalized.colorHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        normalized.colorHex = "#64748B"
                    }
                    return normalized
                }

                if cleaned.isEmpty {
                    return defaultBudgetCategories()
                }

                return cleaned
            }()

            let validCategoryIDs = Set(normalizedBudgetCategories.map { $0.id })
            let fallbackCategoryID = normalizedBudgetCategories.first?.id ?? defaultBudgetCategories().first!.id

            let normalizedRecurringBills: [BudgetRecurringBill] = deduplicated(state.budgetRecurringBills).compactMap { bill in
                var normalized = bill
                normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines)
                normalized.notes = normalized.notes.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !normalized.title.isEmpty, normalized.amount >= 0 else { return nil }
                normalized.dueDay = min(max(normalized.dueDay, 1), 31)
                if !validCategoryIDs.contains(normalized.categoryID) {
                    normalized.categoryID = fallbackCategoryID
                }
                if normalized.updatedAt < normalized.createdAt {
                    normalized.updatedAt = normalized.createdAt
                }
                return normalized
            }

            let normalizedExpenseRecords: [BudgetExpenseRecord] = deduplicated(state.budgetExpenseRecords).compactMap { record in
                var normalized = record
                normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines)
                normalized.notes = normalized.notes.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !normalized.title.isEmpty, normalized.amount >= 0 else { return nil }
                if !validCategoryIDs.contains(normalized.categoryID) {
                    normalized.categoryID = fallbackCategoryID
                }
                return normalized
            }

            let normalizedMonthlySavingsTarget = max(state.budgetMonthlySavingsTarget, 0)
            let normalizedTaxRate = min(max(state.budgetTaxRate, 0), 0.6)
            let validJobBucketIDs = Set(normalizedBuckets.filter { $0.domain == .professional && $0.isJob }.map { $0.id })
            let normalizedPayrollScheduleByBucket: [UUID: BudgetPayrollSchedule] = state.budgetPayrollScheduleByBucket.reduce(into: [:]) { partial, entry in
                let bucketID = entry.key
                let schedule = entry.value
                guard validJobBucketIDs.contains(bucketID) else { return }
                partial[bucketID] = sanitizedPayrollScheduleStatic(schedule)
            }

            return PersistedState(
                buckets: normalizedBuckets,
                items: normalizedItems,
                journalEntries: normalizedJournalEntries,
                settings: state.settings,
                mapStopOrderByItem: normalizedMapStopOrder,
                dynamicMapFavorites: normalizedFavorites,
                dynamicMapSavedRoutes: normalizedRoutes,
                budgetCategories: normalizedBudgetCategories,
                budgetRecurringBills: normalizedRecurringBills,
                budgetExpenseRecords: normalizedExpenseRecords,
                budgetPayrollScheduleByBucket: normalizedPayrollScheduleByBucket,
                budgetMonthlySavingsTarget: normalizedMonthlySavingsTarget,
                budgetTaxRate: normalizedTaxRate
            )
        }

        private static func sanitizedPayrollScheduleStatic(_ schedule: BudgetPayrollSchedule) -> BudgetPayrollSchedule {
            var normalized = schedule
            normalized.payWeekday = min(max(normalized.payWeekday, 1), 7)
            normalized.dayOfMonth = min(max(normalized.dayOfMonth, 1), 31)
            if let second = normalized.secondDayOfMonth {
                normalized.secondDayOfMonth = min(max(second, 1), 31)
            }
            if let anchor = normalized.anchorDateISO, Self.isoDateFormatter.date(from: anchor) == nil {
                normalized.anchorDateISO = nil
            }
            if normalized.cadence == .semimonthly {
                let second = normalized.secondDayOfMonth ?? 15
                if second <= normalized.dayOfMonth {
                    normalized.secondDayOfMonth = min(max(normalized.dayOfMonth + 1, 1), 31)
                }
            }
            return normalized
        }

        private static func normalizedBucket(_ bucket: PlannerBucket, activeDefaultIDs: Set<UUID>) -> PlannerBucket {
            var normalized = bucket
            normalized.name = bucket.name.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.icon = bucket.icon.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.detail = bucket.detail.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.jobSite = bucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.isDefault = activeDefaultIDs.contains(bucket.id)
            if normalized.isDefault {
                normalized.isArchived = false
            }

            if normalized.name.isEmpty {
                normalized.name = "General"
            }
            if normalized.icon.isEmpty {
                normalized.icon = defaultIcon(for: normalized.domain)
            }
            if normalized.colorHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                normalized.colorHex = defaultColorHex(for: normalized.domain)
            }
            if normalized.detail.isEmpty {
                normalized.detail = normalized.isDefault ? "Default \(normalized.domain.title.lowercased()) bucket" : "\(normalized.domain.title) bucket"
            }

            normalized.jobHolidayPatterns = sanitizedHolidayPatterns(normalized.jobHolidayPatterns)

            if normalized.domain != .professional {
                normalized.isJob = false
                normalized.payRate = nil
                normalized.payPeriod = .hourly
                normalized.jobSite = ""
                normalized.jobHolidayPatterns = []
            } else if normalized.isJob {
                if (normalized.payRate ?? 0) <= 0 || normalized.jobSite.isEmpty {
                    normalized.isJob = false
                    normalized.payRate = nil
                    normalized.payPeriod = .hourly
                    normalized.jobSite = ""
                    normalized.jobHolidayPatterns = []
                }
            } else {
                normalized.payRate = nil
                normalized.payPeriod = .hourly
                normalized.jobSite = ""
                normalized.jobHolidayPatterns = []
            }

            if normalized.domain != .personal {
                normalized.isRoutine = false
                normalized.routineFrequency = .weekly
            }

            return normalized
        }

        private static func normalizedItem(_ item: PlanningItem, bucketByID: [UUID: PlannerBucket], defaultIDs: [BucketDomain: UUID]) -> PlanningItem {
            var normalized = item

            let cleanTitle = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.title = cleanTitle.isEmpty ? "Untitled \(item.kind.rawValue.capitalized)" : cleanTitle

            let cleanIcon = item.icon.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.icon = cleanIcon.isEmpty ? PlanningItem.defaultIcon(for: item.kind) : cleanIcon
            normalized.notes = item.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.location = item.location.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.subItems = sanitizedSubItems(item.subItems)

            if let estimated = item.estimatedMinutes, estimated <= 0 {
                normalized.estimatedMinutes = nil
            }

            switch normalized.kind {
            case .event:
                if normalized.startDate == nil {
                    normalized.startDate = normalized.endDate
                }
                if normalized.endDate == nil {
                    normalized.endDate = normalized.startDate
                }
                if let start = normalized.startDate, let end = normalized.endDate, end < start {
                    normalized.endDate = start
                }
                if normalized.isAllDay {
                    normalized.startTime = nil
                    normalized.endTime = nil
                }
            case .task:
                break
            case .reminder:
                break
            }

            let resolvedBucket: PlannerBucket?
            if let bucket = bucketByID[normalized.bucketID], !bucket.isArchived {
                resolvedBucket = bucket
            } else {
                resolvedBucket = nil
            }

            if let bucket = resolvedBucket {
                normalized.domain = bucket.domain
                normalized.bucketID = bucket.id
            } else {
                let fallbackID = defaultIDs[normalized.domain] ?? defaultIDs[.personal]!
                normalized.bucketID = fallbackID
            }

            let canUseAlternate = resolvedBucket?.domain == .professional && resolvedBucket?.isJob == true
            if normalized.repeatRule == .alternateWorkdays {
                if canUseAlternate {
                    normalized.alternateWorkdayConfig = sanitizedAlternateConfig(normalized.alternateWorkdayConfig) ?? AlternateWorkdayConfig()
                } else {
                    normalized.repeatRule = .none
                    normalized.alternateWorkdayConfig = nil
                }
            } else {
                normalized.alternateWorkdayConfig = nil
            }

            return normalized
        }

        private static func sanitizedSubItems(_ subItems: [PlanningSubItem]) -> [PlanningSubItem] {
            deduplicated(subItems).compactMap { subItem in
                let cleanTitle = subItem.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanTitle.isEmpty else { return nil }
                var cleanURL = subItem.urlString?.trimmingCharacters(in: .whitespacesAndNewlines)
                if cleanURL?.isEmpty == true {
                    cleanURL = nil
                }
                return PlanningSubItem(
                    id: subItem.id,
                    kind: subItem.kind,
                    title: cleanTitle,
                    isCompleted: subItem.isCompleted,
                    sourceApp: subItem.sourceApp,
                    sourceEntryID: subItem.sourceEntryID,
                    linkedItemID: subItem.linkedItemID,
                    urlString: cleanURL
                )
            }
        }

        private static func sanitizedAlternateConfig(_ config: AlternateWorkdayConfig?) -> AlternateWorkdayConfig? {
            guard var config else { return nil }

            config.itemHolidayPatterns = sanitizedHolidayPatterns(config.itemHolidayPatterns)
            config.skippedOccurrenceDateISOs = Array(Set(config.skippedOccurrenceDateISOs.filter { isoDateFormatter.date(from: $0) != nil })).sorted()
            config.forcedIncludeDateISOs = Array(Set(config.forcedIncludeDateISOs.filter { isoDateFormatter.date(from: $0) != nil })).sorted()

            if let until = config.untilDateISO, isoDateFormatter.date(from: until) == nil {
                config.untilDateISO = nil
            }

            return config
        }

        private static func sanitizedHolidayPatterns(_ patterns: [WorkHolidayPattern]) -> [WorkHolidayPattern] {
            patterns.compactMap { pattern in
                switch pattern.kind {
                case .specificDate:
                    guard let iso = pattern.specificDateISO, isoDateFormatter.date(from: iso) != nil else { return nil }
                    var valid = pattern
                    valid.specificDateISO = iso
                    valid.recurringMonth = nil
                    valid.recurringDay = nil
                    valid.usHoliday = nil
                    return valid

                case .recurringMonthDay:
                    guard let month = pattern.recurringMonth, let day = pattern.recurringDay else { return nil }
                    guard (1...12).contains(month), (1...31).contains(day) else { return nil }
                    var valid = pattern
                    valid.specificDateISO = nil
                    valid.recurringMonth = month
                    valid.recurringDay = day
                    valid.usHoliday = nil
                    return valid

                case .predefinedUSHoliday:
                    guard let holiday = pattern.usHoliday else { return nil }
                    var valid = pattern
                    valid.specificDateISO = nil
                    valid.recurringMonth = nil
                    valid.recurringDay = nil
                    valid.usHoliday = holiday
                    return valid
                }
            }
        }

        private static func normalizedMapStopOrderByItem(_ mapStopOrderByItem: [UUID: [UUID]], validItemIDs: Set<UUID>) -> [UUID: [UUID]] {
            var normalized: [UUID: [UUID]] = [:]

            for (itemID, orderedStopIDs) in mapStopOrderByItem where validItemIDs.contains(itemID) {
                var seenStopIDs = Set<UUID>()
                let validStops = orderedStopIDs.filter { stopID in
                    guard validItemIDs.contains(stopID) else { return false }
                    return seenStopIDs.insert(stopID).inserted
                }

                if !validStops.isEmpty {
                    normalized[itemID] = validStops
                }
            }

            return normalized
        }

        private static func deduplicated<T: Identifiable>(_ values: [T]) -> [T] where T.ID: Hashable {
            var seen = Set<T.ID>()
            var result: [T] = []
            result.reserveCapacity(values.count)

            for value in values {
                if seen.insert(value.id).inserted {
                    result.append(value)
                }
            }

            return result
        }

        private static func defaultBudgetCategories() -> [BudgetCategory] {
            let now = Date()
            return [
                BudgetCategory(id: UUID(uuidString: "E9274C96-8B97-4F37-B83D-9B8860D52E5D")!, title: "Housing", colorHex: "#2563EB", monthlyLimit: 1800, isArchived: false, createdAt: now),
                BudgetCategory(id: UUID(uuidString: "A4F72D48-CE64-4FD4-A849-9955A3E16BE2")!, title: "Food", colorHex: "#16A34A", monthlyLimit: 650, isArchived: false, createdAt: now),
                BudgetCategory(id: UUID(uuidString: "A88B8023-D153-4C76-8FA0-1EC3D2C357E8")!, title: "Transport", colorHex: "#F59E0B", monthlyLimit: 400, isArchived: false, createdAt: now),
                BudgetCategory(id: UUID(uuidString: "7B0F1969-44E1-4B93-B11F-D65B84FCBA85")!, title: "Utilities", colorHex: "#7C3AED", monthlyLimit: 300, isArchived: false, createdAt: now),
                BudgetCategory(id: UUID(uuidString: "B156ADF6-C5D8-429B-B2A4-A58FB854D3BF")!, title: "Other", colorHex: "#64748B", monthlyLimit: 500, isArchived: false, createdAt: now)
            ]
        }

        private static func defaultIcon(for domain: BucketDomain) -> String {
            switch domain {
            case .personal:
                return "person"
            case .household:
                return "house"
            case .professional:
                return "briefcase"
            }
        }

        private static func defaultColorHex(for domain: BucketDomain) -> String {
            switch domain {
            case .personal:
                return BucketTone.mint.hex
            case .household:
                return BucketTone.amber.hex
            case .professional:
                return BucketTone.ocean.hex
            }
        }

        private static func hasDefaultBuckets(in buckets: [PlannerBucket], defaultIDs: [BucketDomain: UUID]) -> Bool {
            for domain in BucketDomain.allCases {
                guard let expectedID = defaultIDs[domain] else { return false }
                guard let bucket = buckets.first(where: { $0.id == expectedID }) else { return false }
                if !bucket.isDefault { return false }
            }
            return true
        }

        private static func storageURL() -> URL {
            let fm = FileManager.default
            let root = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            let appFolder = root.appendingPathComponent("TimeScapePlannerPro", isDirectory: true)
            if !fm.fileExists(atPath: appFolder.path) {
                try? fm.createDirectory(at: appFolder, withIntermediateDirectories: true)
            }
            return appFolder.appendingPathComponent("planner-state.json", isDirectory: false)
        }

        private static func legacyStorageURL() -> URL {
            let home = FileManager.default.homeDirectoryForCurrentUser
            return home
                .appendingPathComponent("Library", isDirectory: true)
                .appendingPathComponent("Application Support", isDirectory: true)
                .appendingPathComponent("TimeScapePlannerPro", isDirectory: true)
                .appendingPathComponent("planner-state.json", isDirectory: false)
        }

        private static func storageCandidateURLs() -> [URL] {
            let primary = storageURL()
            let legacy = legacyStorageURL()
            if legacy.path == primary.path {
                return [primary]
            }
            return [primary, legacy]
        }
    }

    struct SidebarView: View {
        @Binding var selection: AppDestination

        private let overviewItems: [AppDestination] = [.today, .week, .calendar]
        private let domainItems: [AppDestination] = [.personal, .household, .professional]
        private let planningItems: [AppDestination] = [.events, .tasks, .reminders]

        var body: some View {
            List(selection: $selection) {
                Section("Overview") {
                    ForEach(overviewItems) { destination in
                        NavigationLink(value: destination) {
                            Label(destination.title, systemImage: destination.symbolName)
                        }
                    }
                }

                Section("Planning") {
                    ForEach(planningItems) { destination in
                        NavigationLink(value: destination) {
                            Label(destination.title, systemImage: destination.symbolName)
                        }
                    }
                }

                Section("Domains") {
                    ForEach(domainItems) { destination in
                        NavigationLink(value: destination) {
                            Label(destination.title, systemImage: destination.symbolName)
                        }
                    }
                }

                Section("System") {
                    NavigationLink(value: AppDestination.apps) {
                        Label(AppDestination.apps.title, systemImage: AppDestination.apps.symbolName)
                    }
                    NavigationLink(value: AppDestination.settings) {
                        Label(AppDestination.settings.title, systemImage: AppDestination.settings.symbolName)
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("TimeScape")
            .navigationSplitViewColumnWidth(min: 220, ideal: 250, max: 320)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Text("Planner Pro")
                        .font(.headline)
                }
            }
        }
    }

    struct NativeDestinationView: View {
        let destination: AppDestination
        let startOnboarding: () -> Void

        @State private var isShowingCreateBucketSheet = false
        @State private var isShowingCreateItemSheet = false
        @State private var editingBucket: PlannerBucket?
        @State private var isViewingArchivedBuckets = false
        @State private var planningDateFilter: PlanningDateFilter = .all
        @State private var planningDomainFilter: BucketDomain? = nil
        @State private var planningBucketFilter: UUID? = nil
        @State private var todayShowsNextUp = true
        @State private var todayShowsQuickActions = true
        @State private var weekUsesCompactRows = false
        @State private var weekShowsSummaryCard = true
        @State private var weekShowsWorkWeekOnly = false
        @State private var calendarShowsSummaryCard = true
        @State private var calendarShowsWeekPreview = false

        @EnvironmentObject private var store: PlannerStore

        private var planningFilterBuckets: [PlannerBucket] {
            if let planningDomainFilter {
                return store.activeBuckets(for: planningDomainFilter)
            }

            return BucketDomain.allCases
                .flatMap { store.activeBuckets(for: $0) }
                .sorted { lhs, rhs in
                    if lhs.domain != rhs.domain {
                        return lhs.domain.title.localizedCaseInsensitiveCompare(rhs.domain.title) == .orderedAscending
                    }
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
        }

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    DestinationHero(destination: destination)

                    if destination.isImplemented {
                        nativeContent
                    } else {
                        PlaceholderFeatureCard(destination: destination)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(detailBackground)
            .navigationTitle(destination.title)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        MicroFeedback.tap()
                        isShowingCreateItemSheet = true
                    } label: {
                        Label("New Item", systemImage: "plus")
                    }
                    .disabled(!destination.isImplemented)

                    if destination == .today || destination == .week || destination == .calendar {
                        Menu {
                            switch destination {
                            case .today:
                                Toggle("Show Next Up", isOn: $todayShowsNextUp)
                                Toggle("Show Quick Actions", isOn: $todayShowsQuickActions)

                            case .week:
                                Toggle("Compact Row Height", isOn: $weekUsesCompactRows)
                                Toggle("Show Summary Card", isOn: $weekShowsSummaryCard)
                                Toggle("Work Week (Mon-Fri)", isOn: $weekShowsWorkWeekOnly)

                            case .calendar:
                                Toggle("Show Summary Card", isOn: $calendarShowsSummaryCard)
                                Toggle("Show Week Preview", isOn: $calendarShowsWeekPreview)

                            default:
                                EmptyView()
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .imageScale(.large)
                        }
                        .menuIndicator(.hidden)
                        .menuStyle(.button)
                        .buttonStyle(.bordered)
                        .accessibilityLabel("View options")
                    }

                    if destination.isPlanningDestination {
                        Menu {
                            Section("Date") {
                                Picker("Date", selection: $planningDateFilter) {
                                    ForEach(PlanningDateFilter.allCases) { option in
                                        Text(option.label).tag(option)
                                    }
                                }
                            }

                            Section("Domain") {
                                Picker("Domain", selection: $planningDomainFilter) {
                                    Text("All domains")
                                        .tag(Optional<BucketDomain>.none)

                                    ForEach(BucketDomain.allCases) { domain in
                                        Text(domain.title).tag(Optional(domain))
                                    }
                                }
                            }

                            Section("Bucket") {
                                Picker("Bucket", selection: $planningBucketFilter) {
                                    Text("All buckets")
                                        .tag(Optional<UUID>.none)

                                    ForEach(planningFilterBuckets) { bucket in
                                        Text("\(bucket.domain.title): \(bucket.name)")
                                            .tag(Optional(bucket.id))
                                    }
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .imageScale(.large)
                        }
                        .menuIndicator(.hidden)
                        .menuStyle(.button)
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Filter options")
                    }

                    if destination.isDomain {
                        Menu {
                            Button {
                                isShowingCreateBucketSheet = true
                            } label: {
                                Label("Create Bucket", systemImage: "plus")
                            }

                            Button {
                                isViewingArchivedBuckets.toggle()
                            } label: {
                                Label(
                                    isViewingArchivedBuckets ? "View Active" : "View Archived",
                                    systemImage: isViewingArchivedBuckets ? "tray.full" : "archivebox"
                                )
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .imageScale(.large)
                        }
                        .menuIndicator(.hidden)
                        .menuStyle(.button)
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Page options")
                    }
                }
            }
            .onChange(of: destination) { _, _ in
                isViewingArchivedBuckets = destination.isDomain
                    ? store.settings.prefersArchivedVisibleByDefault
                    : false

                if !destination.isPlanningDestination {
                    planningDateFilter = .all
                    planningDomainFilter = nil
                    planningBucketFilter = nil
                }
            }
            .onChange(of: planningDomainFilter) { _, _ in
                planningBucketFilter = nil
            }
            .sheet(isPresented: $isShowingCreateItemSheet) {
                NewPlanningItemSheet(destination: destination) { draft in
                    store.createItem(from: draft)
                }
            }
        }

        @ViewBuilder
        private var nativeContent: some View {
            switch destination {
            case .today:
                TodayDashboardView(
                    showsNextUp: todayShowsNextUp,
                    showsQuickActions: todayShowsQuickActions
                )
            case .week:
                WeekPlanningView(
                    usesCompactRows: weekUsesCompactRows,
                    showsSummaryCard: weekShowsSummaryCard,
                    showsWorkWeekOnly: weekShowsWorkWeekOnly
                )
            case .calendar:
                CalendarLandingView(
                    showsSummaryCard: calendarShowsSummaryCard,
                    showsWeekPreview: calendarShowsWeekPreview
                )
            case .personal:
                PersonalDomainView(
                    isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                    editingBucket: $editingBucket,
                    isViewingArchivedBuckets: $isViewingArchivedBuckets
                )
            case .household:
                HouseholdDomainView(
                    isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                    editingBucket: $editingBucket,
                    isViewingArchivedBuckets: $isViewingArchivedBuckets
                )
            case .professional:
                ProfessionalDomainView(
                    isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                    editingBucket: $editingBucket,
                    isViewingArchivedBuckets: $isViewingArchivedBuckets
                )
            case .meals:
                MealsPageView()
            case .apps:
                AppsHubView()
            case .events:
                EventsPageView(
                    dateFilter: planningDateFilter,
                    domainFilter: planningDomainFilter,
                    bucketFilter: planningBucketFilter
                )
            case .tasks:
                TasksPageView(
                    dateFilter: planningDateFilter,
                    domainFilter: planningDomainFilter,
                    bucketFilter: planningBucketFilter
                )
            case .reminders:
                RemindersPageView(
                    dateFilter: planningDateFilter,
                    domainFilter: planningDomainFilter,
                    bucketFilter: planningBucketFilter
                )
            case .settings:
                SettingsPageView(onStartOnboarding: startOnboarding)
            }
        }

        private var detailBackground: some View {
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    Color(nsColor: .controlBackgroundColor).opacity(0.7)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    struct DestinationHero: View {
        let destination: AppDestination

        var body: some View {
            HStack(alignment: .center, spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(destination.accent.opacity(0.18))
                    Image(systemName: destination.symbolName)
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(destination.accent)
                }
                .frame(width: 60, height: 60)

                VStack(alignment: .leading, spacing: 6) {
                    Text(destination.title)
                        .font(.largeTitle.weight(.semibold))
                    Text(destination.subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(20)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(destination.accent.opacity(0.18), lineWidth: 1)
            )
        }
    }

    struct TodayDashboardView: View {
        let showsNextUp: Bool
        let showsQuickActions: Bool

        @EnvironmentObject private var store: PlannerStore
        @Environment(\.openWindow) private var openWindow

        private var eventsCount: Int { store.items(for: .event).count }
        private var tasksCount: Int { store.items(for: .task).count }

        private var nextUpItems: [String] {
            store.items.prefix(3).map { item in
                "\(item.kind.rawValue.capitalized): \(item.title)"
            }
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: "Today", eyebrow: "Daily command center")

                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 16) {
                    GridRow {
                        MetricCard(
                            title: "Focus",
                            value: "\(tasksCount) tasks",
                            detail: tasksCount == 0 ? "No tasks yet" : "Ready for your next work block",
                            tint: .blue
                        )
                        MetricCard(
                            title: "Schedule",
                            value: "\(eventsCount) events",
                            detail: eventsCount == 0 ? "No events yet" : "Appointments coming up",
                            tint: .indigo
                        )
                    }

                    if showsNextUp || showsQuickActions {
                        GridRow {
                            if showsNextUp {
                                FeatureListCard(
                                    title: "Next up",
                                    items: nextUpItems.isEmpty ? ["Create your first event, task, or reminder"] : nextUpItems
                                )
                            } else {
                                Color.clear
                            }

                            if showsQuickActions {
                                FeatureListCard(
                                    title: "Quick actions",
                                    items: [
                                        "Create a task",
                                        "Add a calendar event",
                                        "Review reminders"
                                    ]
                                )
                            } else {
                                Color.clear
                            }
                        }
                    }
                }

                if showsQuickActions {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Launch companion apps")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)

                        HStack(spacing: 10) {
                            ForEach(CompanionAppID.allCases) { app in
                                Button {
                                    openWindow(id: app.windowID)
                                } label: {
                                    Label(app.title, systemImage: app.symbolName)
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
        }
    }

    struct SettingsPageView: View {
        @EnvironmentObject private var store: PlannerStore
        let onStartOnboarding: () -> Void
        @State private var displayName: String = ""

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: "Settings", eyebrow: "App preferences")

                VStack(alignment: .leading, spacing: 12) {
                    Text("Profile")
                        .font(.headline)

                    TextField("Display name", text: $displayName)

                    Toggle(
                        "Show archived buckets by default",
                        isOn: Binding(
                            get: { store.settings.prefersArchivedVisibleByDefault },
                            set: { store.setArchivedPreference($0) }
                        )
                    )

                    Text("Header preview: \(store.preferredDisplayName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 10) {
                        Button("Save Name") {
                            store.updateDisplayName(displayName)
                        }
                        .buttonStyle(.borderedProminent)

                        Button("Run Setup Again") {
                            store.reopenOnboarding()
                            onStartOnboarding()
                        }
                        .buttonStyle(.bordered)

                        Button("Reset Sample Items") {
                            store.resetToSampleData()
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(18)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .onAppear {
                displayName = store.settings.displayName
            }
        }
    }

    struct OnboardingSetupView: View {
        @EnvironmentObject private var store: PlannerStore
        @Environment(\.dismiss) private var dismiss

        let onComplete: () -> Void
        let onSkip: () -> Void

        @State private var displayName = ""
        @State private var personalBucketName = "Personal"
        @State private var householdBucketName = "Household"
        @State private var professionalBucketName = "Jobs"

        var body: some View {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Welcome to TimeScape")
                        .font(.largeTitle.weight(.semibold))
                    Text("Set your name and tune the default buckets for the way you plan.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                GroupBox("Your name") {
                    TextField("Display name", text: $displayName)
                }

                GroupBox("Default buckets") {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Personal bucket", text: $personalBucketName)
                        TextField("Household bucket", text: $householdBucketName)
                        TextField("Jobs bucket", text: $professionalBucketName)
                    }
                }

                Text("You can change these later in Settings and the domain pages.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    Button("Skip for now") {
                        onSkip()
                        dismiss()
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    Button("Finish Setup") {
                        store.updateDisplayName(displayName)
                        store.updateDefaultBucket(
                            domain: .personal,
                            name: personalBucketName,
                            colorHex: BucketTone.mint.hex,
                            icon: "person",
                            detail: "Default personal bucket"
                        )
                        store.updateDefaultBucket(
                            domain: .household,
                            name: householdBucketName,
                            colorHex: BucketTone.amber.hex,
                            icon: "house",
                            detail: "Default household bucket"
                        )
                        store.updateDefaultBucket(
                            domain: .professional,
                            name: professionalBucketName,
                            colorHex: BucketTone.ocean.hex,
                            icon: "briefcase",
                            detail: "Default professional bucket"
                        )
                        onComplete()
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(24)
            .frame(width: 560)
            .onAppear {
                displayName = store.settings.displayName
                personalBucketName = store.defaultBucket(for: .personal).name
                householdBucketName = store.defaultBucket(for: .household).name
                professionalBucketName = store.defaultBucket(for: .professional).name
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

