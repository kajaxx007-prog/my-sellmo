const cron = require('node-cron');
const BotTemplate = require('../models/BotTemplate');

const scheduledTasks = new Map();

let schedulerInitialized = false;

/**
 * Uruchamia scheduler tylko raz
 */
async function startScheduler(sendMessageCallback, forceRestart = false) {
    try {
        // blokada przed wielokrotnym uruchomieniem
        if (schedulerInitialized && !forceRestart) {
            console.log('⚠️ Scheduler już działa — pomijam ponowny start');
            return;
        }

        // restart wymuszony lub pierwszy start
        stopAllScheduledTasks();

        const templates = await BotTemplate.find({ active: true });

        console.log(`📋 Znaleziono aktywnych szablonów: ${templates.length}`);

        for (const template of templates) {
            scheduleTemplate(template, sendMessageCallback);
        }

        schedulerInitialized = true;

        console.log('✅ Scheduler został poprawnie uruchomiony');

    } catch (err) {
        console.error('❌ Błąd startScheduler:', err.message);
    }
}

/**
 * Planowanie pojedynczego template
 */
function scheduleTemplate(template, sendMessageCallback) {
    try {
        const templateId = template._id.toString();
        const interval = Number(template.intervalMinutes);

        if (!interval || interval < 1) {
            console.log(`⚠️ Nieprawidłowy interval dla template ${templateId}`);
            return;
        }

        const cronExpression = `*/${interval} * * * *`;

        // zatrzymaj stare zadanie
        if (scheduledTasks.has(templateId)) {
            scheduledTasks.get(templateId).stop();
            scheduledTasks.delete(templateId);
        }

        const task = cron.schedule(cronExpression, async () => {
            try {
                console.log(`⏰ Wysyłam wiadomość: "${template.content}"`);
                await sendMessageCallback(template.content);
            } catch (err) {
                console.error(
                    `❌ Błąd wysyłki template ${templateId}:`,
                    err.message
                );
            }
        });

        scheduledTasks.set(templateId, task);

        console.log(`✅ Zaplanowano template ${templateId}`);

    } catch (err) {
        console.error('❌ Błąd scheduleTemplate:', err.message);
    }
}

/**
 * Zatrzymuje wszystkie taski
 */
function stopAllScheduledTasks() {
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks.clear();

    console.log('🛑 Wszystkie schedulery zatrzymane');
}

/**
 * Aktualizacja pojedynczego template
 */
function rescheduleTemplate(template, sendMessageCallback) {
    const templateId = template._id.toString();

    if (template.active) {
        scheduleTemplate(template, sendMessageCallback);
    } else {
        if (scheduledTasks.has(templateId)) {
            scheduledTasks.get(templateId).stop();
            scheduledTasks.delete(templateId);

            console.log(`🗑 Usunięto scheduler ${templateId}`);
        }
    }
}

module.exports = {
    startScheduler,
    stopAllScheduledTasks,
    rescheduleTemplate
};