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
