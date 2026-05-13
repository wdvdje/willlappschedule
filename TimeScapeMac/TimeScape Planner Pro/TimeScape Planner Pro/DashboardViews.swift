//
//  DashboardViews.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI
import AppKit
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
