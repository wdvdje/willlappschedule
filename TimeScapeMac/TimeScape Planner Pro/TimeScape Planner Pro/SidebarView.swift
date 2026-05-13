//
//  SidebarView.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI
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
