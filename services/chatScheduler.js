// services/chatScheduler.js
const cron = require('node-cron');
const BotTemplate = require('../models/BotTemplate');

const scheduledTasks = new Map();

/**
 * Uruchamia lub restartuje zadania cron na podstawie aktywnych szablonów.
 * @param {Function} sendMessageCallback - funkcja wysyłająca wiadomość (treść)
 * @param {boolean} forceRestart - jeśli true, najpierw usuwa wszystkie stare zadania
 */
async function startScheduler(sendMessageCallback, forceRestart = false) {
    if (forceRestart) {
        scheduledTasks.forEach(task => task.stop());
        scheduledTasks.clear();
    }

    const templates = await BotTemplate.find({ active: true });
    templates.forEach(template => {
        scheduleTemplate(template, sendMessageCallback);
    });
}

/**
 * Planuje pojedynczy szablon.
 */
function scheduleTemplate(template, sendMessageCallback) {
    const interval = template.intervalMinutes;
    const cronExpression = `*/${interval} * * * *`; // co X minut

    // Zatrzymaj stare zadanie, jeśli istnieje
    if (scheduledTasks.has(template._id.toString())) {
        scheduledTasks.get(template._id.toString()).stop();
    }

    const task = cron.schedule(cronExpression, () => {
        console.log(`⏰ Wysłanie cyklicznej wiadomości: "${template.content}"`);
        sendMessageCallback(template.content);
    });

    scheduledTasks.set(template._id.toString(), task);
}

/**
 * Zatrzymuje wszystkie zadania.
 */
function stopAllScheduledTasks() {
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks.clear();
}

/**
 * Dodaje/aktualizuje pojedynczy szablon w schedulerze.
 */
function rescheduleTemplate(template, sendMessageCallback) {
    if (template.active) {
        scheduleTemplate(template, sendMessageCallback);
    } else {
        // Jeśli nieaktywny, zatrzymaj zadanie
        if (scheduledTasks.has(template._id.toString())) {
            scheduledTasks.get(template._id.toString()).stop();
            scheduledTasks.delete(template._id.toString());
        }
    }
}

module.exports = { startScheduler, stopAllScheduledTasks, rescheduleTemplate };