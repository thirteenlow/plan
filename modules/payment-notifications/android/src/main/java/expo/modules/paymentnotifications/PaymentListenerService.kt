package expo.modules.paymentnotifications

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android calls this for every notification once the user allows Plan notification access. Only the apps Plan was
 * set to listen to, and only notifications with an amount in them (like 4.50 or 1.234,56), are kept.
 */
class PaymentListenerService : NotificationListenerService() {
  private val amount = Regex("""\d[.,]\d\d""")
  private val labels = HashMap<String, String>()

  companion object {
    /** The connected listener, so Plan can disconnect it when turned off. */
    @Volatile var connected: PaymentListenerService? = null
  }

  override fun onListenerConnected() {
    // Turned off in Plan while Android was reconnecting: let go again.
    if (PaymentQueue.paused(this)) requestUnbind() else connected = this
  }

  override fun onListenerDisconnected() {
    connected = null
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    if (pkg == packageName) return
    val n = sbn.notification ?: return
    // A group's summary repeats its children.
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val label = labelOf(pkg)
    if (!PaymentQueue.isWatched(this, pkg, label)) return

    val extras = n.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim().orEmpty()
    // Some wallets put the amount in the title: keep it with the text, where Plan looks for it.
    val text = if (!amount.containsMatchIn(body) && amount.containsMatchIn(title)) listOf(title, body).filter { it.isNotEmpty() }.joinToString(" · ") else body
    if (!amount.containsMatchIn(text)) return

    PaymentQueue.add(this, label, title, text, sbn.postTime, sbn.key ?: "")
  }

  private fun labelOf(pkg: String): String =
    labels.getOrPut(pkg) {
      try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
      } catch (e: PackageManager.NameNotFoundException) {
        pkg
      }
    }
}
