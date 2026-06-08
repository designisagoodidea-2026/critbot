// dgToUtterances.js — group Deepgram streaming results into the Screen 1
// transcript model. UMD: works in Node (tests) and the browser (live page).
//
// Deepgram (diarize=true) returns, per result message:
//   { is_final, speech_final, channel: { alternatives: [ { words: [
//       { word, start, end, speaker, punctuated_word } ] } ] } }
// Each word carries a `speaker` integer (0,1,2...). We collapse consecutive
// same-speaker words into one utterance, matching {speaker, t, tSeconds, text}.

"use strict";

function fmt(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}

// speakerName: optional (n) => "Jason" mapping; defaults to "Speaker N".
function resultToUtterances(dgResult, speakerName) {
  const alt =
    dgResult && dgResult.channel && dgResult.channel.alternatives && dgResult.channel.alternatives[0];
  const words = (alt && alt.words) || [];
  const transcript = (alt && alt.transcript) || "";
  const name = speakerName || ((n) => "Speaker " + (n == null ? "?" : n));
  const baseStart = dgResult && typeof dgResult.start === "number"
    ? dgResult.start : ((words[0] && words[0].start) || 0);

  const utterances = [];
  if (words.length) {
    // Word-level data present (typical on finals with diarize=true): group by speaker.
    let cur = null;
    for (const w of words) {
      const spk = w.speaker == null ? 0 : w.speaker;
      const token = w.punctuated_word || w.word || "";
      if (!cur || cur.speakerId !== spk) {
        cur = { speakerId: spk, speaker: name(spk), t: fmt(w.start), tSeconds: Math.floor(w.start || 0), text: token, classification: null, aiSuggestion: null };
        utterances.push(cur);
      } else {
        cur.text += " " + token;
      }
    }
  } else if (transcript.trim()) {
    // No word-level data (common on interim results): fall back to the transcript
    // string so text still renders. Diarization fills in once words arrive.
    utterances.push({ speakerId: 0, speaker: name(0), t: fmt(baseStart), tSeconds: Math.floor(baseStart), text: transcript.trim(), classification: null, aiSuggestion: null });
  }
  return {
    isFinal: !!(dgResult && dgResult.is_final),
    speechFinal: !!(dgResult && dgResult.speech_final),
    utterances
  };
}

const api = { resultToUtterances, fmt };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.dgToUtterances = api;
