package id.fiberix.zteshell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Foreground service tipe specialUse: menjaga sesi SSH/Telnet yang user mulai.
 * Bisa dihentikan dari notifikasi (syarat Play: user perceptible + user stoppable).
 */
public class OltKeepAliveService extends Service {
    static final String ACTION_START = "id.fiberix.zteshell.KEEP_START";
    static final String ACTION_STOP = "id.fiberix.zteshell.KEEP_STOP";
    static final String ACTION_USER_STOP = "id.fiberix.zteshell.USER_STOP_SESSION";
    static final String EXTRA_LABEL = "label";
    private static final String CHANNEL = "olt_session";
    private static final int NOTIF_ID = 41;

    static void start(Context ctx, String label) {
        Intent i = new Intent(ctx, OltKeepAliveService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_LABEL, label);
        ContextCompat.startForegroundService(ctx, i);
    }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, OltKeepAliveService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            Intent stopped = new Intent(ACTION_USER_STOP);
            stopped.setPackage(getPackageName());
            sendBroadcast(stopped);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        String label = intent != null ? intent.getStringExtra(EXTRA_LABEL) : null;
        if (label == null || label.trim().isEmpty()) label = getString(R.string.app_name);
        ensureChannel();
        Notification n = buildNotification(label);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n);
        } else {
            startForeground(NOTIF_ID, n);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL, getString(R.string.keep_channel), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.keep_channel_desc));
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String label) {
        Intent open = new Intent(this, TerminalActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stop = new Intent(this, OltKeepAliveService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this, 1, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle(getString(R.string.keep_title))
                .setContentText(getString(R.string.keep_text, label))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi)
                .addAction(0, getString(R.string.disconnect), stopPi)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
