//
//  TimeScape_Planner_ProApp.swift
//  TimeScape Planner Pro
//
//  Created by William Joyce on 5/10/26.
//

import SwiftUI

struct TimeScapeHelpCommands: Commands {
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(replacing: .help) {
            Button("TimeScape Planner Pro Help") {
                openWindow(id: "timescape.app.help")
            }
            .keyboardShortcut("?", modifiers: .command)
        }
    }
}

@main
struct TimeScape_Planner_ProApp: App {
    @StateObject private var plannerStore = PlannerStore()

    @StateObject private var helpStore = HelpStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(plannerStore)
        }
        .commands {
            TimeScapeHelpCommands()
        }

        Window("Journal", id: CompanionAppID.journal.windowID) {
            JournalAppView()
                .environmentObject(plannerStore)
        }

        Window("Dynamic Weather", id: CompanionAppID.weather.windowID) {
            CompanionAppWindowRoot(app: .weather)
                .environmentObject(plannerStore)
        }

        Window("Meals", id: CompanionAppID.meals.windowID) {
            CompanionAppWindowRoot(app: .meals)
                .environmentObject(plannerStore)
        }

        Window("Dynamic Map", id: CompanionAppID.dynamicMap.windowID) {
            CompanionAppWindowRoot(app: .dynamicMap)
                .environmentObject(plannerStore)
        }
        .defaultSize(width: 1180, height: 760)

        Window("Budgeting", id: CompanionAppID.budgeting.windowID) {
            CompanionAppWindowRoot(app: .budgeting)
                .environmentObject(plannerStore)
        }

        Window("Help", id: "timescape.app.help") {
            HelpWindowView()
                .environmentObject(helpStore)
        }
    }
}
