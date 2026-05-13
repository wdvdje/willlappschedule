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

