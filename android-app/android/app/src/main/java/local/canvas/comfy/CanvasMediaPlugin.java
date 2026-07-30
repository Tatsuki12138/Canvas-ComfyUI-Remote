package local.canvas.comfy;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "CanvasMedia")
public class CanvasMediaPlugin extends Plugin {
    private String sanitizeFilename(String filename, String mimeType) {
        String cleaned = filename.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!cleaned.contains(".")) {
            if ("image/jpeg".equals(mimeType)) cleaned += ".jpg";
            else if ("image/webp".equals(mimeType)) cleaned += ".webp";
            else cleaned += ".png";
        }
        return cleaned;
    }

    private Uri createMediaItem(String filename, String album, String mimeType) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
        }
        return resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
    }

    private void finishMediaItem(Uri uri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, done, null, null);
        }
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "canvas.png");
        String album = call.getString("album", "Canvas");
        String mimeType = call.getString("mimeType", "image/png");

        if (data == null || data.length() == 0) {
            call.reject("Missing image data");
            return;
        }

        filename = sanitizeFilename(filename, mimeType);

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            Uri uri = createMediaItem(filename, album, mimeType);
            if (uri == null) {
                call.reject("Cannot create media item");
                return;
            }

            try (OutputStream stream = resolver.openOutputStream(uri)) {
                if (stream == null) {
                    call.reject("Cannot open media stream");
                    return;
                }
                stream.write(bytes);
                stream.flush();
            }

            finishMediaItem(uri);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("filename", filename);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void saveImageFromUrl(PluginCall call) {
        String urlValue = call.getString("url");
        String filename = call.getString("filename", "canvas.png");
        String album = call.getString("album", "Canvas");
        String mimeType = call.getString("mimeType", "image/png");
        if (urlValue == null || urlValue.isEmpty()) {
            call.reject("Missing image URL");
            return;
        }

        final String safeFilename = sanitizeFilename(filename, mimeType);
        final String requestedMimeType = mimeType;
        new Thread(() -> {
            HttpURLConnection connection = null;
            Uri uri = null;
            try {
                connection = (HttpURLConnection) new URL(urlValue).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "image/*");
                connection.connect();
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new Exception("Image download failed (" + status + ")");
                }

                String responseType = connection.getContentType();
                String finalMimeType = responseType != null && responseType.startsWith("image/")
                    ? responseType
                    : requestedMimeType;
                uri = createMediaItem(safeFilename, album, finalMimeType);
                if (uri == null) throw new Exception("Cannot create media item");

                ContentResolver resolver = getContext().getContentResolver();
                try (InputStream input = connection.getInputStream(); OutputStream output = resolver.openOutputStream(uri)) {
                    if (output == null) throw new Exception("Cannot open media stream");
                    byte[] buffer = new byte[128 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                    output.flush();
                }
                finishMediaItem(uri);

                JSObject result = new JSObject();
                result.put("uri", uri.toString());
                result.put("filename", safeFilename);
                call.resolve(result);
            } catch (Exception error) {
                if (uri != null) getContext().getContentResolver().delete(uri, null, null);
                call.reject(error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "CanvasImageSave").start();
    }
}
