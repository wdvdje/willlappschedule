import Foundation

/// Service for bridging grocery list items with the task management system
class GroceryTaskBridge {
    static let shared = GroceryTaskBridge()

    /// Represents a grocery item that can be added as a task subitem
    struct GrocerySubitem: Codable, Identifiable {
        var id: UUID = UUID()
        var name: String
        var quantity: String
        var isCompleted: Bool = false
        var dateAdded: Date = Date()
    }

    private static let groceryTasksKey = "grocery_task_items"

    /// Add individual grocery items as task subitems
    func addGroceryItemsAsTask(items: [String: Double], taskTitle: String = "Weekly Grocery Shopping") -> UUID {
        let taskId = UUID()

        var subitems: [GrocerySubitem] = []
        for (itemName, quantity) in items.sorted(by: { $0.key < $1.key }) {
            subitems.append(GrocerySubitem(
                name: itemName.capitalized,
                quantity: String(format: "%.1f g", quantity)
            ))
        }

        let task = GroceryTask(
            id: taskId,
            title: taskTitle,
            subitems: subitems,
            createdDate: Date()
        )

        saveGroceryTask(task)
        return taskId
    }

    /// Add a single item as a new subitem to an existing grocery task
    func addItemToTask(taskId: UUID, itemName: String, quantity: Double) {
        guard var task = getGroceryTask(id: taskId) else { return }

        let subitem = GrocerySubitem(
            name: itemName.capitalized,
            quantity: String(format: "%.1f g", quantity)
        )
        task.subitems.append(subitem)
        saveGroceryTask(task)
    }

    /// Toggle completion status of a subitem
    func toggleSubitemCompletion(taskId: UUID, subitemId: UUID) {
        guard var task = getGroceryTask(id: taskId) else { return }

        if let index = task.subitems.firstIndex(where: { $0.id == subitemId }) {
            task.subitems[index].isCompleted.toggle()
            saveGroceryTask(task)
        }
    }

    /// Remove a subitem from a grocery task
    func removeSubitem(taskId: UUID, subitemId: UUID) {
        guard var task = getGroceryTask(id: taskId) else { return }

        task.subitems.removeAll { $0.id == subitemId }
        saveGroceryTask(task)
    }

    /// Get all grocery tasks
    func getAllGroceryTasks() -> [GroceryTask] {
        guard let data = UserDefaults.standard.data(forKey: Self.groceryTasksKey) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([GroceryTask].self, from: data)) ?? []
    }

    /// Get a specific grocery task by ID
    func getGroceryTask(id: UUID) -> GroceryTask? {
        getAllGroceryTasks().first { $0.id == id }
    }

    /// Save a grocery task
    private func saveGroceryTask(_ task: GroceryTask) {
        var tasks = getAllGroceryTasks()
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        } else {
            tasks.append(task)
        }
        saveAllGroceryTasks(tasks)
    }

    /// Delete a grocery task
    func deleteGroceryTask(id: UUID) {
        var tasks = getAllGroceryTasks()
        tasks.removeAll { $0.id == id }
        saveAllGroceryTasks(tasks)
    }

    private func saveAllGroceryTasks(_ tasks: [GroceryTask]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(tasks) {
            UserDefaults.standard.set(data, forKey: Self.groceryTasksKey)
        }
    }

    /// Export grocery task as a formatted string for adding to task items
    func exportAsTaskFormat(taskId: UUID) -> String? {
        guard let task = getGroceryTask(id: taskId) else { return nil }

        var output = "## \(task.title)\n"
        for subitem in task.subitems {
            let status = subitem.isCompleted ? "✓" : "○"
            output += "- [\(status)] \(subitem.name) (\(subitem.quantity))\n"
        }
        return output
    }

    /// Get completion percentage for a task
    func getCompletionPercentage(taskId: UUID) -> Double {
        guard let task = getGroceryTask(id: taskId), !task.subitems.isEmpty else {
            return 0
        }

        let completed = task.subitems.filter { $0.isCompleted }.count
        return Double(completed) / Double(task.subitems.count) * 100
    }
}

/// Model for a grocery shopping task with subitems
struct GroceryTask: Codable, Identifiable {
    var id: UUID = UUID()
    var title: String
    var subitems: [GroceryTaskBridge.GrocerySubitem] = []
    var createdDate: Date = Date()
    var lastModified: Date = Date()

    var completionCount: Int {
        subitems.filter { $0.isCompleted }.count
    }

    var totalCount: Int {
        subitems.count
    }

    var isComplete: Bool {
        completionCount == totalCount && totalCount > 0
    }

    mutating func updateModified() {
        lastModified = Date()
    }
}
