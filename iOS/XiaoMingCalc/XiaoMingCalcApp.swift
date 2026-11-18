import SwiftUI
import WebKit
import AVFoundation

private func restoredCalculatorTheme() -> String {
    guard let saved = UserDefaults.standard.string(forKey: "calculatorState"),
          let data = saved.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let settings = object["settings"] as? [String: Any],
          let theme = settings["theme"] as? String else { return "samsung" }
    return theme
}

private func calculatorCanvas(_ theme: String) -> UIColor {
    if theme == "samsung-dark" { return UIColor(red: 5/255, green: 5/255, blue: 5/255, alpha: 1) }
    let light: UIColor
    switch theme {
    case "mint": light = UIColor(red: 242/255, green: 249/255, blue: 246/255, alpha: 1)
    case "blue": light = UIColor(red: 242/255, green: 247/255, blue: 252/255, alpha: 1)
    case "orange": light = UIColor(red: 252/255, green: 247/255, blue: 240/255, alpha: 1)
    case "pink": light = UIColor(red: 251/255, green: 245/255, blue: 247/255, alpha: 1)
    case "violet": light = UIColor(red: 248/255, green: 245/255, blue: 252/255, alpha: 1)
    case "graphite": light = UIColor(red: 243/255, green: 245/255, blue: 247/255, alpha: 1)
    case "ember": light = UIColor(red: 250/255, green: 245/255, blue: 237/255, alpha: 1)
    default: light = UIColor(red: 246/255, green: 246/255, blue: 246/255, alpha: 1)
    }
    return UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 5/255, green: 5/255, blue: 5/255, alpha: 1)
            : light
    }
}

@main
struct XiaoMingCalcApp: App {
    @State private var theme = restoredCalculatorTheme()

    private var canvasColor: Color {
        Color(uiColor: calculatorCanvas(theme))
    }

    var body: some Scene {
        WindowGroup {
            CalculatorView(theme: $theme)
                .background(canvasColor.ignoresSafeArea())
                .ignoresSafeArea(.container, edges: .bottom)
                .preferredColorScheme(theme == "samsung-dark" ? .dark : nil)
        }
    }
}

struct CalculatorView: UIViewRepresentable {
    @Binding var theme: String

    func makeCoordinator() -> Coordinator { Coordinator(theme: $theme) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "haptic")
        controller.add(context.coordinator, name: "saveState")
        controller.add(context.coordinator, name: "copyText")
        controller.add(context.coordinator, name: "themeChanged")
        controller.add(context.coordinator, name: "speakText")
        controller.add(context.coordinator, name: "stopSpeech")
        if let saved = UserDefaults.standard.string(forKey: "calculatorState"),
           let data = try? JSONSerialization.data(withJSONObject: saved, options: .fragmentsAllowed),
           let literal = String(data: data, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: "window.__nativeInitialState = \(literal);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = calculatorCanvas(theme)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.isScrollEnabled = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        view.allowsLinkPreview = false
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        let color = calculatorCanvas(theme)
        uiView.backgroundColor = color
        uiView.scrollView.backgroundColor = color
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, AVAudioPlayerDelegate {
        private var theme: Binding<String>
        private let synthesizer = AVSpeechSynthesizer()
        private var audioPlayer: AVAudioPlayer?
        private var clipQueue: [URL] = []

        private let voiceClips = [
            "零": "zero", "一": "one", "二": "two", "三": "three", "四": "four",
            "五": "five", "六": "six", "七": "seven", "八": "eight", "九": "nine",
            "十": "ten", "百": "hundred", "千": "thousand", "万": "ten_thousand", "亿": "hundred_million",
            "点": "point", "加": "plus", "减": "minus", "乘以": "multiply", "除以": "divide",
            "等于": "equals", "百分比": "percent", "归零": "reset", "清除": "clear", "退位": "backspace"
        ]

        init(theme: Binding<String>) {
            self.theme = theme
            DispatchQueue.global(qos: .userInitiated).async {
                try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "haptic" {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } else if message.name == "saveState", let value = message.body as? String {
                UserDefaults.standard.set(value, forKey: "calculatorState")
            } else if message.name == "copyText", let value = message.body as? String {
                UIPasteboard.general.string = value
            } else if message.name == "themeChanged", let theme = message.body as? String {
                DispatchQueue.main.async { self.theme.wrappedValue = theme }
            } else if message.name == "speakText", let payload = message.body as? [String: String],
                      let text = payload["text"], !text.isEmpty {
                speak(text, mode: payload["mode"] ?? "mandarin")
            } else if message.name == "stopSpeech" {
                stopAudio()
            }
        }

        private func stopAudio() {
            audioPlayer?.stop()
            audioPlayer = nil
            clipQueue.removeAll()
            if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        }

        private func speak(_ text: String, mode: String) {
            stopAudio()
            if mode == "mandarin", let clips = clipURLs(for: text) {
                clipQueue = clips
                playNextClip()
                return
            }
            let utterance = AVSpeechUtterance(string: text)
            let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "zh-CN" }
            if mode == "male" { utterance.voice = voices.first(where: { $0.gender == .male }) ?? AVSpeechSynthesisVoice(language: "zh-CN") }
            else if mode == "female" { utterance.voice = voices.first(where: { $0.gender == .female }) ?? AVSpeechSynthesisVoice(language: "zh-CN") }
            else { utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN") }
            // Some phones only have one Chinese system voice. Keep the previews
            // audibly different even when iOS falls back to that same voice.
            switch mode {
            case "male":
                utterance.rate = 0.45
                utterance.pitchMultiplier = 0.78
            case "female":
                utterance.rate = 0.53
                utterance.pitchMultiplier = 1.20
            case "mandarin":
                utterance.rate = 0.56
                utterance.pitchMultiplier = 1.04
            default:
                utterance.rate = 0.50
                utterance.pitchMultiplier = 1.0
            }
            utterance.volume = 1.0
            synthesizer.speak(utterance)
        }

        private func clipURLs(for text: String) -> [URL]? {
            var remaining = text
            var urls: [URL] = []
            let phrases = ["百分比", "乘以", "除以", "等于", "归零", "清除", "退位"]
            while !remaining.isEmpty {
                let token = phrases.first(where: { remaining.hasPrefix($0) }) ?? String(remaining.first!)
                guard let name = voiceClips[token],
                      let url = Bundle.main.url(forResource: name, withExtension: "wav", subdirectory: "Web/sounds") else {
                    return nil
                }
                urls.append(url)
                remaining.removeFirst(token.count)
            }
            return urls.isEmpty ? nil : urls
        }

        private func playNextClip() {
            guard !clipQueue.isEmpty else { audioPlayer = nil; return }
            let url = clipQueue.removeFirst()
            do {
                audioPlayer = try AVAudioPlayer(contentsOf: url)
                audioPlayer?.delegate = self
                audioPlayer?.prepareToPlay()
                audioPlayer?.play()
            } catch {
                playNextClip()
            }
        }

        func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
            playNextClip()
        }
    }
}
