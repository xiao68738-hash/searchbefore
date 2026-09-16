package tw.searchbefore.nativeapp

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.app.job.JobService
import android.app.job.JobParameters
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.time.LocalDate
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicLong

object NativeReminders {
    const val JOB = 960916
    const val NOTICE = 960917
    const val CHANNEL = "record-review"
    private val lock = Any()
    fun allowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 26 || context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE)
    fun reconcile(context: Context, enabled: Boolean): Boolean = synchronized(lock) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (!enabled) {
            scheduler.cancel(JOB)
            NotificationManagerCompat.from(context).cancel(NOTICE)
            return@synchronized true
        }
        if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "本機紀錄核對提醒", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "提醒核對已記錄的採收等待期；不是可採收或殘留合格保證。"
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            })
        if (!allowed(context)) { scheduler.cancel(JOB); return@synchronized false }
        if (scheduler.allPendingJobs.any { it.id == JOB }) return@synchronized true
        scheduler.schedule(JobInfo.Builder(JOB, ComponentName(context, ReminderJob::class.java))
            .setPeriodic(24 * 60 * 60 * 1000L).setPersisted(true).build()) == JobScheduler.RESULT_SUCCESS
    }
    fun invalidate(context: Context) = synchronized(lock) { NotificationManagerCompat.from(context).cancel(NOTICE) }
    @android.annotation.SuppressLint("MissingPermission") // allowed() checks runtime permission + app/channel; notify also catches revocation races.
    fun check(context: Context, active: () -> Boolean = { true }, test: Boolean = false): Boolean {
        // This lock is shared with writes: AtomicFile readFully must not race a writer.
        return NativeStore(context).readLocked { doc -> synchronized(lock) {
            if (!active() || !doc.optBoolean("remindersEnabled") || !allowed(context)) return@synchronized false
            val today = LocalDate.now().toString()
            val prefs = context.getSharedPreferences("native-reminder-delivery", Context.MODE_PRIVATE)
            if (!test && (prefs.getString("lastDay", "") == today || !ReminderPolicy.needsReview(doc.getJSONObject("data")))) return@synchronized false
            val pending = PendingIntent.getActivity(context, NOTICE, Intent(context, MainActivity::class.java).putExtra("open_records", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val message = if(test) "測試通知已送達；這不是採收或用藥建議。" else "請開啟 APP 核對紀錄、產品標示及採收等待期；不代表可採收或殘留合格。"
            val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_record_notice)
                .setContentTitle(if(test) "噴前查｜測試提醒" else "噴前查｜紀錄核對提醒")
                .setContentText(message).setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(pending).setAutoCancel(true)
                .setTimeoutAfter(12 * 60 * 60 * 1000L).build()
            if (!active()) return@synchronized false
            try {
                NotificationManagerCompat.from(context).notify(NOTICE, notification)
                if (!test) prefs.edit().putString("lastDay", today).apply()
                true
            } catch (_: SecurityException) { false }
        } }
    }
}

/** System-only service, no network, no exact alarm and no exported record payload. */
class ReminderJob : JobService() {
    private val executor = Executors.newSingleThreadExecutor()
    private val generation = AtomicLong()
    private var work: Future<*>? = null
    override fun onStartJob(params: JobParameters): Boolean {
        val ticket = generation.incrementAndGet()
        work = executor.submit {
            runCatching { NativeReminders.check(this, active = { generation.get() == ticket && !Thread.currentThread().isInterrupted }) }
            Handler(Looper.getMainLooper()).post { if (generation.get() == ticket) jobFinished(params, false) }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { generation.incrementAndGet(); work?.cancel(true); return true }
    override fun onDestroy() { generation.incrementAndGet(); executor.shutdownNow(); super.onDestroy() }
}
