package expo.modules.paymentnotifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaymentNotificationsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No Android context")

  private val component: ComponentName
    get() = ComponentName(context, PaymentListenerService::class.java)

  override fun definition() = ModuleDefinition {
    Name("PaymentNotifications")

    Events("onPayment")

    OnCreate {
      PaymentQueue.onAdded = { sendEvent("onPayment", emptyMap<String, Any>()) }
    }

    OnDestroy {
      PaymentQueue.onAdded = null
    }

    /** True once the user has allowed Plan notification access in Android Settings. */
    Function("hasAccess") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      enabled.split(":").any { ComponentName.unflattenFromString(it)?.packageName == context.packageName }
    }

    /** Opens Android's notification access screen (straight to Plan's switch where Android allows it). */
    Function("openAccessSettings") {
      val detail = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
      val intent =
        if (detail) Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
        else Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (e: Exception) {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    /** What to listen to: the wallets, and other apps by name or package. */
    Function("configure") { wallets: Boolean, apps: List<String> ->
      PaymentQueue.configure(context, wallets, apps)
      // Android sometimes stops a listener (e.g. after an update): ask for it to be connected again.
      if (wallets || apps.isNotEmpty()) {
        try {
          NotificationListenerService.requestRebind(component)
        } catch (e: Exception) {
        }
      }
    }

    Function("getConfig") {
      mapOf("wallets" to PaymentQueue.walletsOn(context), "apps" to PaymentQueue.apps(context).toList())
    }

    Function("peek") { PaymentQueue.peek(context) }

    Function("ack") { upTo: Double -> PaymentQueue.ack(context, upTo.toLong()) }
  }
}
