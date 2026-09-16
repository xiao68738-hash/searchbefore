package tw.searchbefore.nativeapp

import android.app.NotificationManager
import android.app.job.JobScheduler
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.os.Build
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID

/** Permission changes ONLY in disposable nativepreview emulator; records/prefs use an isolated root. */
class NativeReminderTest {
    @Test fun permissionSchedulingDeliveryAndCancellation() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val app=instrumentation.targetContext
        assumeTrue(app.packageName=="tw.searchbefore.app.nativepreview" && Build.MODEL.contains("sdk_gphone"))
        val unique="reminder-"+UUID.randomUUID()
        val root=File(app.cacheDir,unique).apply{mkdirs()}
        val context=object:ContextWrapper(app) {
            override fun getNoBackupFilesDir()=File(root,"no-backup").apply{mkdirs()}
            override fun getFilesDir()=File(root,"files").apply{mkdirs()}
            override fun getSharedPreferences(name:String,mode:Int):SharedPreferences=app.getSharedPreferences(unique+name,mode)
        }
        fun permission(verb:String) {
            if(Build.VERSION.SDK_INT>=33) instrumentation.uiAutomation.executeShellCommand("pm $verb ${app.packageName} android.permission.POST_NOTIFICATIONS").use { fd ->
                android.os.ParcelFileDescriptor.AutoCloseInputStream(fd).use { it.readBytes() }
            }
        }
        val original=NativeReminders.allowed(app)
        try {
            val store=NativeStore(context)
            store.save(NativeDocument.empty().put("remindersEnabled",true))
            permission("revoke")
            if(Build.VERSION.SDK_INT>=33) {
                assertFalse(NativeReminders.reconcile(context,true))
                assertFalse(NativeReminders.check(context,test=true))
            }
            permission("grant")
            assertTrue(NativeReminders.reconcile(context,true))
            assertTrue(app.getSystemService(JobScheduler::class.java).allPendingJobs.any { it.id==NativeReminders.JOB })
            assertFalse(NativeReminders.check(context)) // empty data is not a harvest event
            assertTrue(NativeReminders.check(context,test=true))
            val notification=app.getSystemService(NotificationManager::class.java).activeNotifications.first { it.id==NativeReminders.NOTICE }.notification
            assertTrue(notification.extras.getCharSequence("android.text").toString().contains("不是採收"))
            assertEquals(android.app.Notification.VISIBILITY_PRIVATE,notification.visibility)
            val restored=NativeDocument.replaceData(store.load(),Backup.empty(),true)
            assertFalse(restored.getBoolean("remindersEnabled"))
            store.save(restored)
            NativeReminders.reconcile(context,false)
            assertFalse(NativeReminders.check(context,test=true))
            assertFalse(app.getSystemService(JobScheduler::class.java).allPendingJobs.any { it.id==NativeReminders.JOB })
            assertFalse(app.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id==NativeReminders.NOTICE })
        } finally {
            NativeReminders.reconcile(context,false)
            permission(if(original) "grant" else "revoke")
        }
    }
}
