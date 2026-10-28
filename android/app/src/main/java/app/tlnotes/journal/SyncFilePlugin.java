package app.tlnotes.journal;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SyncFile")
public class SyncFilePlugin extends Plugin {

    private static final String PREF = "tlnotes-sync";
    private static final String KEY = "uri";

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        Uri uri = stored();
        result.put("name", uri == null ? "" : displayName(uri));
        call.resolve(result);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        boolean create = Boolean.TRUE.equals(call.getBoolean("create", false));
        Intent intent = new Intent(create ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        if (create) intent.putExtra(Intent.EXTRA_TITLE, "tlnotes.json");
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve();
            return;
        }
        Uri uri = data.getData();
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (flags == 0) flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException error) {
            call.reject("The file permission could not be kept.");
            return;
        }
        getContext().getSharedPreferences(PREF, Activity.MODE_PRIVATE).edit().putString(KEY, uri.toString()).apply();
        JSObject body = new JSObject();
        body.put("name", displayName(uri));
        call.resolve(body);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("filename", "tlnotes.json");
        String type = call.getString("type", "application/json");
        if (call.getString("text") == null) {
            call.reject("Nothing to save.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type == null || type.isEmpty() ? "application/octet-stream" : type);
        intent.putExtra(Intent.EXTRA_TITLE, name == null || name.isEmpty() ? "tlnotes.json" : name);
        startActivityForResult(call, intent, "saved");
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject body = new JSObject();
            body.put("cancelled", true);
            call.resolve(body);
            return;
        }
        String text = call.getString("text", "");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
            if (output == null || text == null) {
                call.reject("Could not write the file.");
                return;
            }
            output.write(text.getBytes(StandardCharsets.UTF_8));
            JSObject body = new JSObject();
            body.put("name", displayName(data.getData()));
            call.resolve(body);
        } catch (Exception error) {
            call.reject("Could not write the file.");
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri uri = stored();
        if (uri == null) {
            call.reject("No sync file.");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) {
                call.reject("Could not read the sync file.");
                return;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) buffer.write(chunk, 0, count);
            JSObject body = new JSObject();
            body.put("text", new String(buffer.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(body);
        } catch (Exception error) {
            call.reject("Could not read the sync file.");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        Uri uri = stored();
        String text = call.getString("text", "");
        if (uri == null || text == null) {
            call.reject("No sync file.");
            return;
        }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) {
                call.reject("Could not write the sync file.");
                return;
            }
            output.write(text.getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not write the sync file.");
        }
    }

    @PluginMethod
    public void forget(PluginCall call) {
        Uri uri = stored();
        if (uri != null) {
            try {
                getContext()
                    .getContentResolver()
                    .releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException ignored) {
                /* the permission may already be gone */
            }
        }
        getContext().getSharedPreferences(PREF, Activity.MODE_PRIVATE).edit().remove(KEY).apply();
        call.resolve();
    }

    private Uri stored() {
        String raw = getContext().getSharedPreferences(PREF, Activity.MODE_PRIVATE).getString(KEY, "");
        if (raw == null || raw.isEmpty()) return null;
        return Uri.parse(raw);
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            /* fall through to the uri itself */
        }
        String last = uri.getLastPathSegment();
        return last == null || last.isEmpty() ? "tlnotes.json" : last;
    }
}
