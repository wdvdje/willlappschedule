//
//  NavigationViews.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI
import AppKit
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
            .cardStyle(cornerRadius: 24, tint: destination.accent, hasBorder: true)
        }
    }
