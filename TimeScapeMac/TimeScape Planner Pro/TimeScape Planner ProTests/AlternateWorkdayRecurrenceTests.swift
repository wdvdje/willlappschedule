import XCTest
@testable import TimeScape_Planner_Pro

final class AlternateWorkdayRecurrenceTests: XCTestCase {
    private var store: PlannerStore!

    override func setUp() {
        super.setUp()
        store = PlannerStore()
    }

    override func tearDown() {
        store = nil
        super.tearDown()
    }

    func testPatternAAlternatesEveryOtherWorkdayFromStart() throws {
        let bucketID = try makeJobBucket()
        let item = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 5),
            config: AlternateWorkdayConfig(startingPattern: .a, respectsHolidayExclusions: false)
        )

        let occurrences = store.occurrenceDates(
            for: item,
            from: date(2026, 1, 5),
            to: date(2026, 1, 16)
        )

        XCTAssertEqual(localDayStrings(occurrences), [
            "2026-01-05",
            "2026-01-07",
            "2026-01-09",
            "2026-01-13",
            "2026-01-15"
        ])
    }

    func testPatternBUsesComplementaryWorkdaysFromStart() throws {
        let bucketID = try makeJobBucket()
        let item = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 12),
            config: AlternateWorkdayConfig(startingPattern: .b, respectsHolidayExclusions: false)
        )

        let occurrences = store.occurrenceDates(
            for: item,
            from: date(2026, 1, 5),
            to: date(2026, 1, 16)
        )

        XCTAssertEqual(localDayStrings(occurrences), [
            "2026-01-13",
            "2026-01-15"
        ])
    }

    func testRecurringMonthDayHolidayIsExcluded() throws {
        let bucketID = try makeJobBucket()
        store.updateBucketJobHolidayPatterns(
            bucketID: bucketID,
            patterns: [
                WorkHolidayPattern(kind: .recurringMonthDay, recurringMonth: 1, recurringDay: 7)
            ]
        )

        let item = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 5),
            config: AlternateWorkdayConfig(startingPattern: .a, respectsHolidayExclusions: true)
        )

        let occurrences = store.occurrenceDates(
            for: item,
            from: date(2026, 1, 5),
            to: date(2026, 1, 9)
        )

        XCTAssertEqual(localDayStrings(occurrences), [
            "2026-01-05",
            "2026-01-09"
        ])
    }

    func testLeapYearRecurringHolidayExcludesFeb29OnlyInLeapYear() throws {
        let bucketID = try makeJobBucket()
        store.updateBucketJobHolidayPatterns(
            bucketID: bucketID,
            patterns: [
                WorkHolidayPattern(kind: .recurringMonthDay, recurringMonth: 2, recurringDay: 29)
            ]
        )

        let item = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2028, 2, 28),
            config: AlternateWorkdayConfig(startingPattern: .a, respectsHolidayExclusions: true)
        )

        let occurrences = store.occurrenceDates(
            for: item,
            from: date(2028, 2, 28),
            to: date(2028, 3, 1)
        )

        XCTAssertEqual(localDayStrings(occurrences), [
            "2028-02-28",
            "2028-03-01"
        ])
    }

    func testForcedIncludeAndSkipPrecedence() throws {
        let bucketID = try makeJobBucket()
        store.updateBucketJobHolidayPatterns(
            bucketID: bucketID,
            patterns: [
                WorkHolidayPattern(kind: .specificDate, specificDateISO: isoDateStringForStore(date(2026, 1, 7)))
            ]
        )

        let forcedISO = isoDateStringForStore(date(2026, 1, 7))

        let forcedOnlyItem = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 5),
            config: AlternateWorkdayConfig(
                startingPattern: .a,
                respectsHolidayExclusions: true,
                itemHolidayPatterns: [],
                skippedOccurrenceDateISOs: [],
                forcedIncludeDateISOs: [forcedISO]
            )
        )

        let forcedAndSkippedItem = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 5),
            config: AlternateWorkdayConfig(
                startingPattern: .a,
                respectsHolidayExclusions: true,
                itemHolidayPatterns: [],
                skippedOccurrenceDateISOs: [forcedISO],
                forcedIncludeDateISOs: [forcedISO]
            )
        )

        let forcedOnlyDays = localDayStrings(
            store.occurrenceDates(for: forcedOnlyItem, from: date(2026, 1, 5), to: date(2026, 1, 9))
        )
        let forcedAndSkippedDays = localDayStrings(
            store.occurrenceDates(for: forcedAndSkippedItem, from: date(2026, 1, 5), to: date(2026, 1, 9))
        )

        XCTAssertTrue(forcedOnlyDays.contains("2026-01-07"))
        XCTAssertFalse(forcedAndSkippedDays.contains("2026-01-07"))
    }

    func testAlternateWorkdaysStopsAtUntilDate() throws {
        let bucketID = try makeJobBucket()
        let item = makeAlternateTask(
            bucketID: bucketID,
            dueDate: date(2026, 1, 5),
            config: AlternateWorkdayConfig(
                startingPattern: .a,
                respectsHolidayExclusions: false,
                untilDateISO: "2026-01-07"
            )
        )

        let occurrences = store.occurrenceDates(
            for: item,
            from: date(2026, 1, 5),
            to: date(2026, 1, 16)
        )

        XCTAssertEqual(localDayStrings(occurrences), [
            "2026-01-05",
            "2026-01-07"
        ])
    }

    private func makeJobBucket() throws -> UUID {
        guard let bucketID = store.createBucket(
            domain: .professional,
            name: "Tests \(UUID().uuidString)",
            colorHex: "#2255FF",
            icon: "briefcase",
            detail: "Test bucket",
            isJob: true,
            payRate: 30,
            payPeriod: .hourly,
            jobSite: "HQ",
            isRoutine: false,
            routineFrequency: .weekly
        ) else {
            throw TestError.unexpectedNil
        }
        return bucketID
    }

    private func makeAlternateTask(bucketID: UUID, dueDate: Date, config: AlternateWorkdayConfig) -> PlanningItem {
        PlanningItem(
            id: UUID(),
            kind: .task,
            title: "Edge Case Task",
            icon: "checkmark.circle",
            domain: .professional,
            bucketID: bucketID,
            repeatRule: .alternateWorkdays,
            alternateWorkdayConfig: config,
            dueDate: dueDate
        )
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        components.minute = 0
        components.second = 0
        return components.date!
    }

    private func localDayStrings(_ dates: [Date]) -> [String] {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return dates.map { formatter.string(from: $0) }
    }

    private func isoDateStringForStore(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Calendar.current.startOfDay(for: date))
    }

    private enum TestError: Error {
        case unexpectedNil
    }
}
