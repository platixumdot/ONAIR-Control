package org.onaircontrol.camera

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanOptions
import com.journeyapps.barcodescanner.ScanContract
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.util.concurrent.TimeUnit

private data class Pairing(
    val server: String,
    val session: String,
    val token: String,
)

class MainActivity : ComponentActivity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val httpClient = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build()
    private lateinit var status: TextView
    private lateinit var preview: SurfaceViewRenderer
    private lateinit var scanButton: Button
    private lateinit var reconnectButton: Button
    private lateinit var stopButton: Button
    private lateinit var eglBase: EglBase

    private var factory: PeerConnectionFactory? = null
    private var capturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private var textureHelper: SurfaceTextureHelper? = null
    private var peer: PeerConnection? = null
    private var socket: WebSocket? = null
    private var pairing: Pairing? = null
    private var captureStarted = false
    private var reconnectRunnable: Runnable? = null
    private var reconnectAttempts = 0
    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var remoteDescriptionSet = false
    private var stopping = false
    private val mediaPermissionRequest = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
        val cameraGranted = permissions[Manifest.permission.CAMERA] == true
        val audioGranted = permissions[Manifest.permission.RECORD_AUDIO] == true
        if (cameraGranted && audioGranted) startStreaming()
        else updateStatus("Kamera- und Mikrofonzugriff sind erforderlich. Bitte beide Berechtigungen erlauben.")
    }

    private val qrScanner = registerForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents.isNullOrBlank()) {
            updateStatus("QR-Scan abgebrochen")
        } else {
            parsePairing(contents)?.let(::saveAndConnect)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        eglBase = EglBase.create()
        buildLayout()
        val saved = getPreferences(MODE_PRIVATE)
        val server = saved.getString("server", null)
        val session = saved.getString("session", null)
        val token = saved.getString("token", null)
        if (server != null && session != null && token != null) {
            pairing = Pairing(server, session, token)
            reconnectButton.isEnabled = true
            updateStatus("Bereit zum Verbinden")
        }
    }

    private fun buildLayout() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(20, 24, 20, 20)
            setBackgroundColor(Color.rgb(15, 17, 20))
        }
        status = TextView(this).apply {
            text = "Kopple dein Smartphone mit dem Control Center"
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(8, 8, 8, 18)
        }
        preview = SurfaceViewRenderer(this)
        preview.init(eglBase.eglBaseContext, null)
        preview.setMirror(false)
        scanButton = Button(this).apply {
            text = "Mit QR-Code koppeln"
            setOnClickListener {
                qrScanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("ONAIR Control QR-Code scannen").setBeepEnabled(false).setOrientationLocked(false))
            }
        }
        reconnectButton = Button(this).apply {
            text = "Zuletzt gekoppelte Kamera verbinden"
            isEnabled = false
            setOnClickListener { startStreaming() }
        }
        stopButton = Button(this).apply {
            text = "Übertragung stoppen"
            isEnabled = false
            setOnClickListener { stopStreaming() }
        }
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(preview, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(scanButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(reconnectButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(stopButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)
    }

    private fun parsePairing(raw: String): Pairing? {
        return try {
            val uri = Uri.parse(raw)
            val server = uri.getQueryParameter("server")
            val session = uri.getQueryParameter("session")
            val token = uri.getQueryParameter("token")
            if (uri.scheme != "onaircam" || uri.host != "pair" || server.isNullOrBlank() ||
                session.isNullOrBlank() || token.isNullOrBlank() ||
                (!server.startsWith("ws://") && !server.startsWith("wss://"))
            ) {
                updateStatus("Ungültiger ONAIR-Kopplungs-QR-Code")
                null
            } else {
                Pairing(server, session, token)
            }
        } catch (error: Exception) {
            updateStatus("QR-Code konnte nicht gelesen werden: ${error.localizedMessage}")
            null
        }
    }

    private fun saveAndConnect(value: Pairing) {
        pairing = value
        getPreferences(MODE_PRIVATE).edit()
            .putString("server", value.server)
            .putString("session", value.session)
            .putString("token", value.token)
            .apply()
        reconnectButton.isEnabled = true
        startStreaming()
    }

    private fun startStreaming() {
        val value = pairing ?: return updateStatus("Bitte zuerst den QR-Code scannen")
        val missingPermissions = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missingPermissions.isNotEmpty()) {
            mediaPermissionRequest.launch(missingPermissions.toTypedArray())
            return
        }
        stopping = false
        scanButton.isEnabled = false
        reconnectButton.isEnabled = false
        stopButton.isEnabled = true
        updateStatus("Kamera wird gestartet …")
        try {
            initializeCamera()
            connect(value)
        } catch (error: Exception) {
            stopStreaming()
            updateStatus("Kamerafehler: ${error.localizedMessage}")
        }
    }

    private fun initializeCamera() {
        if (factory != null) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions(),
        )
        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()

        val enumerator = Camera2Enumerator(this)
        val cameraName = enumerator.deviceNames.firstOrNull { enumerator.isBackFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()
            ?: error("Keine Kamera gefunden.")
        capturer = enumerator.createCapturer(cameraName, null) as? CameraVideoCapturer
            ?: error("Die Smartphone-Kamera konnte nicht geöffnet werden.")
        val source = factory!!.createVideoSource(false)
        videoSource = source
        val helper = SurfaceTextureHelper.create("ONAIR-Camera-Capture", eglBase.eglBaseContext)
        textureHelper = helper
        capturer!!.initialize(helper, this, source.capturerObserver)
        capturer!!.startCapture(1920, 1080, 60)
        captureStarted = true
        videoTrack = factory!!.createVideoTrack("ONAIR-Camera-Video", source)
        videoTrack!!.addSink(preview)
        val microphone = factory!!.createAudioSource(MediaConstraints())
        audioSource = microphone
        audioTrack = factory!!.createAudioTrack("ONAIR-Camera-Audio", microphone)
    }

    private fun connect(value: Pairing) {
        createPeer()
        val request = Request.Builder()
            .url("${value.server}?role=publisher&session=${Uri.encode(value.session)}&token=${Uri.encode(value.token)}")
            .build()
        socket = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (stopping || socket !== webSocket) return
                reconnectAttempts = 0
                webSocket.send(JSONObject().put("type", "publisher-ready").toString())
                updateStatus("Signalisierung verbunden – warte auf OBS-Quelle")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleSignal(text)
            }

            override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
                val responseDetail = response?.let { " HTTP ${it.code} ${it.message}." } ?: ""
                scheduleReconnect(webSocket, "Verbindung zu ${value.server} fehlgeschlagen.$responseDetail ${error.localizedMessage ?: "Netzwerkfehler"}")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (stopping || socket !== webSocket) return
                if (code == INVALID_PAIRING_CLOSE_CODE) {
                    socket = null
                    updateStatus("Kopplung abgelehnt. Der QR-Code ist ungültig oder wurde erneuert; bitte einen neuen Code scannen.")
                } else {
                    scheduleReconnect(webSocket, "Verbindung getrennt ($code${if (reason.isBlank()) "" else ": $reason"}).")
                }
            }
        })
    }

    private fun scheduleReconnect(webSocket: WebSocket, reason: String) {
        if (stopping || socket !== webSocket) return
        socket = null
        val serverUri = pairing?.server?.let(Uri::parse)
        val host = serverUri?.host.orEmpty()
        val hint = if (host == "localhost" || host.startsWith("127.") || host == "::1") {
            " Der QR-Code enthält localhost; scanne einen neuen Code mit der LAN-IP des Rechners."
        } else {
            " Prüfe, ob beide Geräte im selben WLAN sind und TCP-Port ${serverUri?.port?.takeIf { it >= 0 } ?: 3010} erreichbar ist."
        }
        updateStatus("$reason$hint Neuer Verbindungsversuch …")
        reconnectRunnable?.let(mainHandler::removeCallbacks)
        val delay = (RECONNECT_DELAY_MS * (1L shl reconnectAttempts.coerceAtMost(MAX_RECONNECT_EXPONENT))).coerceAtMost(MAX_RECONNECT_DELAY_MS)
        reconnectAttempts++
        val retry = Runnable {
            reconnectRunnable = null
            if (!stopping) {
                closePeer()
                pairing?.let(::connect)
            }
        }
        reconnectRunnable = retry
        mainHandler.postDelayed(retry, delay)
    }

    private fun createPeer() {
        closePeer()
        val configuration = PeerConnection.RTCConfiguration(emptyList())
        peer = factory?.createPeerConnection(configuration, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) {
                    updateStatus("Live – Kamera wird übertragen")
                } else if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.DISCONNECTED) {
                    updateStatus("Keine Verbindung zur OBS-Quelle")
                }
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
            override fun onIceCandidate(candidate: IceCandidate) {
                sendSignal(JSONObject()
                    .put("type", "candidate")
                    .put("candidate", JSONObject()
                        .put("candidate", candidate.sdp)
                        .put("sdpMid", candidate.sdpMid)
                        .put("sdpMLineIndex", candidate.sdpMLineIndex)))
            }
            override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) = Unit
            override fun onAddStream(stream: org.webrtc.MediaStream) = Unit
            override fun onRemoveStream(stream: org.webrtc.MediaStream) = Unit
            override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onAddTrack(receiver: org.webrtc.RtpReceiver, mediaStreams: Array<org.webrtc.MediaStream>) = Unit
        }) ?: error("WebRTC-Verbindung konnte nicht erstellt werden.")
        videoTrack?.let { track ->
            val sender = peer?.addTrack(track, listOf("ONAIR-Camera-Stream"))
                ?: error("Video-Spur konnte nicht hinzugefügt werden.")
            val parameters = sender.parameters
            parameters.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION
            parameters.encodings.forEach { encoding ->
                encoding.maxBitrateBps = VIDEO_MAX_BITRATE_BPS
                encoding.maxFramerate = VIDEO_FRAME_RATE
            }
            if (!sender.setParameters(parameters)) {
                updateStatus("Hinweis: Das Gerät kann die gewünschte Video-Bitrate eventuell nicht erreichen.")
            }
        }
        audioTrack?.let { track ->
            peer?.addTrack(track, listOf("ONAIR-Camera-Stream"))
                ?: error("Audio-Spur konnte nicht hinzugefügt werden.")
        }
    }

    private fun handleSignal(raw: String) {
        try {
            val message = JSONObject(raw)
            when (message.optString("type")) {
                "viewer-ready" -> createOffer()
                "peer-disconnected" -> {
                    closePeer()
                    if (!stopping) createPeer()
                    updateStatus("Verbunden – warte auf OBS-Quelle")
                }
                "answer" -> {
                    val description = message.getJSONObject("description")
                    val answer = SessionDescription(
                        SessionDescription.Type.fromCanonicalForm(description.getString("type")),
                        description.getString("sdp"),
                    )
                    peer?.setRemoteDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            remoteDescriptionSet = true
                            flushCandidates()
                        }
                        override fun onSetFailure(error: String) = updateStatus("OBS-Antwort fehlgeschlagen: $error")
                        override fun onCreateSuccess(description: SessionDescription) = Unit
                        override fun onCreateFailure(error: String) = Unit
                    }, answer)
                }
                "candidate" -> {
                    val candidateJson = message.getJSONObject("candidate")
                    val candidate = IceCandidate(
                        candidateJson.optString("sdpMid"),
                        candidateJson.optInt("sdpMLineIndex"),
                        candidateJson.getString("candidate"),
                    )
                    if (remoteDescriptionSet) peer?.addIceCandidate(candidate) else pendingCandidates.add(candidate)
                }
            }
        } catch (error: Exception) {
            updateStatus("Übertragungsfehler: ${error.localizedMessage}")
        }
    }

    private fun createOffer() {
        val connection = peer ?: return
        remoteDescriptionSet = false
        connection.createOffer(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {
                connection.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        sendSignal(JSONObject()
                            .put("type", "offer")
                            .put("description", JSONObject()
                                .put("type", description.type.canonicalForm())
                                .put("sdp", description.description)))
                    }
                    override fun onSetFailure(error: String) = updateStatus("Kameraangebot fehlgeschlagen: $error")
                    override fun onCreateSuccess(description: SessionDescription) = Unit
                    override fun onCreateFailure(error: String) = Unit
                }, description)
            }
            override fun onCreateFailure(error: String) = updateStatus("Kameraangebot fehlgeschlagen: $error")
            override fun onSetSuccess() = Unit
            override fun onSetFailure(error: String) = updateStatus("Kameraangebot fehlgeschlagen: $error")
        }, MediaConstraints())
    }

    private fun flushCandidates() {
        pendingCandidates.forEach { peer?.addIceCandidate(it) }
        pendingCandidates.clear()
    }

    private fun sendSignal(message: JSONObject) {
        socket?.send(message.toString())
    }

    private fun closePeer() {
        remoteDescriptionSet = false
        pendingCandidates.clear()
        peer?.close()
        peer = null
    }

    private fun stopStreaming() {
        stopping = true
        reconnectRunnable?.let(mainHandler::removeCallbacks)
        reconnectRunnable = null
        socket?.close(1000, "Übertragung gestoppt")
        socket = null
        closePeer()
        if (captureStarted) {
            try {
                capturer?.stopCapture()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
            captureStarted = false
        }
        capturer?.dispose()
        capturer = null
        videoTrack?.removeSink(preview)
        videoTrack?.dispose()
        videoTrack = null
        audioTrack?.dispose()
        audioTrack = null
        audioSource?.dispose()
        audioSource = null
        videoSource?.dispose()
        videoSource = null
        textureHelper?.dispose()
        textureHelper = null
        factory?.dispose()
        factory = null
        preview.clearImage()
        scanButton.isEnabled = true
        reconnectButton.isEnabled = pairing != null
        stopButton.isEnabled = false
        updateStatus("Übertragung gestoppt")
    }

    private fun updateStatus(value: String) {
        runOnUiThread { if (::status.isInitialized) status.text = value }
    }

    override fun onDestroy() {
        stopStreaming()
        preview.release()
        eglBase.release()
        httpClient.dispatcher.executorService.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val RECONNECT_DELAY_MS = 2_000L
        private const val MAX_RECONNECT_DELAY_MS = 30_000L
        private const val MAX_RECONNECT_EXPONENT = 4
        private const val INVALID_PAIRING_CLOSE_CODE = 1008
        private const val VIDEO_FRAME_RATE = 60
        private const val VIDEO_MAX_BITRATE_BPS = 12_000_000
    }
}
