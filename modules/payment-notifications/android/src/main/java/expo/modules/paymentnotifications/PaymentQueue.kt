package expo.modules.paymentnotifications

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Payment notifications waiting for Plan to log them, kept on the phone (SharedPreferences) so nothing is lost
 * while the app is closed. Plan reads them with peek() and removes them with ack() once they're saved.
 */
object PaymentQueue {
  private const val PREFS = "plan_payment_notifications"
  private const val MAX = 500

  /** Google Wallet, Samsung Wallet, and Google Play services (which posts Google Wallet's alerts on some phones). */
  val WALLETS = setOf("com.google.android.apps.walletnfcrel", "com.samsung.android.spay", "com.google.android.gms")

  /** Set while the app is running, so a new payment can be logged straight away. */
  @Volatile var onAdded: (() -> Unit)? = null

  fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun walletsOn(context: Context) = prefs(context).getBoolean("wallets", false)

  /** Other apps to listen to, by name or package (e.g. "SimplyGo", "sg.com.transitlink"), lowercased. */
  fun apps(context: Context): Set<String> = prefs(context).getStringSet("apps", emptySet()) ?: emptySet()

  fun configure(context: Context, wallets: Boolean, apps: List<String>) {
    prefs(context).edit()
      .putBoolean("wallets", wallets)
      .putStringSet("apps", apps.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet())
      .apply()
  }

  fun isWatched(context: Context, pkg: String, label: String): Boolean {
    if (walletsOn(context) && pkg in WALLETS) return true
    val apps = apps(context)
    return pkg.lowercase() in apps || label.lowercase() in apps
  }

  @Synchronized
  fun add(context: Context, app: String, title: String, text: String, postedAt: Long, key: String) {
    val p = prefs(context)
    // The same notification is often posted again when it's updated: only keep it once.
    val sig = "$key|$text"
    val recent = JSONArray(p.getString("recent", "[]"))
    for (i in 0 until recent.length()) if (recent.getString(i) == sig) return
    recent.put(sig)
    while (recent.length() > 50) recent.remove(0)

    val items = JSONArray(p.getString("items", "[]"))
    val id = p.getLong("nextId", 1)
    items.put(JSONObject().put("id", id).put("app", app).put("title", title).put("text", text).put("postedAt", postedAt))
    while (items.length() > MAX) items.remove(0)
    p.edit().putString("items", items.toString()).putString("recent", recent.toString()).putLong("nextId", id + 1).apply()
    onAdded?.invoke()
  }

  @Synchronized
  fun peek(context: Context): List<Map<String, Any>> {
    val items = JSONArray(prefs(context).getString("items", "[]"))
    return (0 until items.length()).map { i ->
      val o = items.getJSONObject(i)
      mapOf(
        "id" to o.getLong("id").toDouble(),
        "app" to o.optString("app"),
        "title" to o.optString("title"),
        "text" to o.optString("text"),
        "postedAt" to o.optLong("postedAt").toDouble(),
      )
    }
  }

  /** Removes everything up to and including `upTo` (what Plan has saved). */
  @Synchronized
  fun ack(context: Context, upTo: Long) {
    val p = prefs(context)
    val items = JSONArray(p.getString("items", "[]"))
    val left = JSONArray()
    for (i in 0 until items.length()) if (items.getJSONObject(i).getLong("id") > upTo) left.put(items.getJSONObject(i))
    p.edit().putString("items", left.toString()).apply()
  }
}
