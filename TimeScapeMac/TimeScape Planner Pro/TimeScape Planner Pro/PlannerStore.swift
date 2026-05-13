//
//  PlannerStore.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI
import AppKit
import Combine
import Foundation

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

    func deleteDynamicMapFavorite(favoriteID: UUID) {
        dynamicMapFavorites.removeAll { $0.id == favoriteID }
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
