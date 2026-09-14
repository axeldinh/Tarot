package net.tarot.nearby;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import androidx.annotation.NonNull;

/**
 * A thin bridge over Google Nearby Connections, in P2P_STAR.
 *
 * This is the only native code in the project, and it is deliberately dull: it
 * translates a handful of calls and callbacks and holds no game state at all.
 * Everything that decides anything — seating, reconnection, the rules — is the
 * TypeScript above it, which runs and is tested in Node.
 *
 * Both ends accept a connection automatically. Nearby offers an authentication
 * token to read aloud, which is the right thing when pairing strangers; here the
 * players are sitting at the same table and picked it by name, so a code to
 * compare would be ceremony rather than safety. Nothing sensitive crosses the
 * link: it carries a card game.
 */
@CapacitorPlugin(
    name = "NearbyConnections",
    permissions = {
        @Permission(
            alias = NearbyConnectionsPlugin.BLUETOOTH,
            strings = {
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        ),
        @Permission(
            alias = NearbyConnectionsPlugin.WIFI,
            strings = { Manifest.permission.NEARBY_WIFI_DEVICES }
        ),
        @Permission(
            alias = NearbyConnectionsPlugin.LOCATION,
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public class NearbyConnectionsPlugin extends Plugin {

    public static final String BLUETOOTH = "bluetooth";
    public static final String WIFI = "wifi";
    public static final String LOCATION = "location";

    private static final Strategy STRATEGY = Strategy.P2P_STAR;

    private ConnectionsClient client;
    /** Endpoint id to the name it advertised, so `connected` can report it. */
    private final Map<String, String> names = new HashMap<>();
    private String localName = "Tarot";

    private ConnectionsClient client() {
        if (client == null) {
            client = Nearby.getConnectionsClient(getContext());
        }
        return client;
    }

    // ----------------------------------------------------------- permissions

    /**
     * Which permissions matter depends on the Android version, so the caller is
     * spared having to know: it asks once and is told yes or no.
     */
    private String[] neededAliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] { BLUETOOTH, WIFI };
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { BLUETOOTH, LOCATION };
        }
        return new String[] { LOCATION };
    }

    private boolean allGranted() {
        for (String alias : neededAliases()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                return false;
            }
        }
        return true;
    }

    private void resolveGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", allGranted());
        call.resolve(result);
    }

    @PluginMethod
    @Override
    public void checkPermissions(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    @Override
    public void requestPermissions(PluginCall call) {
        if (allGranted()) {
            resolveGranted(call);
            return;
        }
        requestPermissionForAliases(neededAliases(), call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        resolveGranted(call);
    }

    private boolean requirePermissions(PluginCall call) {
        if (allGranted()) {
            return true;
        }
        call.reject("Les autorisations Bluetooth et Wi-Fi sont necessaires", "permission-denied");
        return false;
    }

    // ----------------------------------------------------------- advertising

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (!requirePermissions(call)) {
            return;
        }
        String serviceId = call.getString("serviceId");
        if (serviceId == null) {
            call.reject("serviceId is required");
            return;
        }
        String name = call.getString("name");
        localName = name == null ? "Tarot" : name;

        client()
            .startAdvertising(
                localName,
                serviceId,
                connectionCallback,
                new AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
            )
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(message(error, "startAdvertising failed"), error));
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        client().stopAdvertising();
        call.resolve();
    }

    // ------------------------------------------------------------- discovery

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!requirePermissions(call)) {
            return;
        }
        String serviceId = call.getString("serviceId");
        if (serviceId == null) {
            call.reject("serviceId is required");
            return;
        }

        client()
            .startDiscovery(
                serviceId,
                discoveryCallback,
                new DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
            )
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(message(error, "startDiscovery failed"), error));
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        client().stopDiscovery();
        call.resolve();
    }

    // ------------------------------------------------------------ connecting

    @PluginMethod
    public void requestConnection(PluginCall call) {
        if (!requirePermissions(call)) {
            return;
        }
        String endpointId = call.getString("endpointId");
        if (endpointId == null) {
            call.reject("endpointId is required");
            return;
        }
        String name = call.getString("name");
        if (name != null) {
            localName = name;
        }

        client()
            .requestConnection(localName, endpointId, connectionCallback)
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(message(error, "requestConnection failed"), error));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId == null) {
            call.reject("endpointId is required");
            return;
        }
        client().disconnectFromEndpoint(endpointId);
        names.remove(endpointId);
        call.resolve();
    }

    @PluginMethod
    public void reset(PluginCall call) {
        letGoOfTheRadio();
        call.resolve();
    }

    // --------------------------------------------------------------- payload

    @PluginMethod
    public void send(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String payload = call.getString("payload");
        if (endpointId == null || payload == null) {
            call.reject("endpointId and payload are required");
            return;
        }

        client()
            .sendPayload(endpointId, Payload.fromBytes(payload.getBytes(StandardCharsets.UTF_8)))
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(message(error, "send failed"), error));
    }

    // ------------------------------------------------------------- callbacks

    private final EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
            names.put(endpointId, info.getEndpointName());
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("name", info.getEndpointName());
            notifyListeners("endpointFound", event);
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            names.remove(endpointId);
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            notifyListeners("endpointLost", event);
        }
    };

    private final ConnectionLifecycleCallback connectionCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo info) {
            names.put(endpointId, info.getEndpointName());
            // Everyone is in the same room and chose the table by name; see the
            // note at the top about why there is no code to read aloud.
            client().acceptConnection(endpointId, payloadCallback);
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution resolution) {
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            if (resolution.getStatus().isSuccess()) {
                String name = names.get(endpointId);
                event.put("name", name == null ? "" : name);
                notifyListeners("connected", event);
            } else {
                notifyListeners("disconnected", event);
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            names.remove(endpointId);
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            notifyListeners("disconnected", event);
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            byte[] bytes = payload.asBytes();
            if (bytes == null) {
                return;
            }
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("payload", new String(bytes, StandardCharsets.UTF_8));
            notifyListeners("payload", event);
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate update) {
            // Messages here are a few hundred bytes and arrive whole; there is
            // nothing useful to report about their progress.
        }
    };

    private void letGoOfTheRadio() {
        client().stopAdvertising();
        client().stopDiscovery();
        client().stopAllEndpoints();
        names.clear();
    }

    /** Leave the radio as we found it when the app goes away. */
    @Override
    protected void handleOnDestroy() {
        letGoOfTheRadio();
        super.handleOnDestroy();
    }

    private static String message(Exception error, String fallback) {
        String text = error.getMessage();
        return text == null ? fallback : text;
    }
}
