import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import {
  places,
  demoPath,
  haversineKm,
  interpolate,
  saveVisited,
  clearVisited,
  PROXIMITY_KM,
  STEP_INTERVAL_MS,
  INTERP_STEPS,
  INTERP_INTERVAL_MS,
  type Place,
} from "@/lib/data";
import {
  BADGES,
  loadEarnedBadges,
  saveEarnedBadges,
  clearEarnedBadges,
  getBadgeById,
  type Badge,
} from "@/lib/badges";
import { playBadgeSound } from "@/lib/audio";

type JourneyStatus = "idle" | "running" | "done";

interface StoryState {
  place: Place;
  visible: boolean;
}

interface BadgeToast {
  badge: Badge;
  leaving: boolean;
}

export default function GeoRawi() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<Record<string, L.Marker>>({});
  const stepIndexRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interpStepRef = useRef(0);
  const isRunningRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<JourneyStatus>("idle");
  const [currentPos, setCurrentPos] = useState(demoPath[0]);
  const [nearestPlace, setNearestPlace] = useState<Place | null>(null);
  const [nearestDist, setNearestDist] = useState<number | null>(null);
  const [story, setStory] = useState<StoryState | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [fullStoryPlace, setFullStoryPlace] = useState<Place | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [continuityMsg, setContinuityMsg] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 640);

  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(loadEarnedBadges);
  const earnedBadgesRef = useRef<Set<string>>(earnedBadges);
  earnedBadgesRef.current = earnedBadges;

  const [badgeQueue, setBadgeQueue] = useState<string[]>([]);
  const [currentToast, setCurrentToast] = useState<BadgeToast | null>(null);

  const visitedRef = useRef(visited);
  visitedRef.current = visited;

  const unlockBadges = useCallback((currentVisited: Set<string>, journeyDone: boolean) => {
    const newIds: string[] = [];

    if (currentVisited.size >= 1 && !earnedBadgesRef.current.has("first_discovery")) {
      newIds.push("first_discovery");
    }
    if (currentVisited.size >= places.length && !earnedBadgesRef.current.has("kharj_explorer")) {
      newIds.push("kharj_explorer");
    }
    if (journeyDone && !earnedBadgesRef.current.has("history_master")) {
      newIds.push("history_master");
    }

    if (newIds.length > 0) {
      const updated = new Set(earnedBadgesRef.current);
      for (const id of newIds) updated.add(id);
      saveEarnedBadges(updated);
      setEarnedBadges(updated);
      earnedBadgesRef.current = updated;
      setBadgeQueue((q) => [...q, ...newIds]);
    }
  }, []);

  useEffect(() => {
    if (badgeQueue.length === 0 || currentToast !== null) return;

    const nextId = badgeQueue[0];
    const badge = getBadgeById(nextId);
    if (!badge) {
      setBadgeQueue((q) => q.slice(1));
      return;
    }

    playBadgeSound();
    setCurrentToast({ badge, leaving: false });

    toastTimerRef.current = setTimeout(() => {
      setCurrentToast((t) => (t ? { ...t, leaving: true } : null));
      setTimeout(() => {
        setCurrentToast(null);
        setBadgeQueue((q) => q.slice(1));
      }, 420);
    }, 3200);
  }, [badgeQueue, currentToast]);

  const updatePlaceMarker = (id: string, isVisited: boolean) => {
    const marker = placeMarkersRef.current[id];
    if (marker) {
      const el = marker.getElement();
      if (el) {
        const dot = el.querySelector(".place-marker-dot");
        if (dot) {
          if (isVisited) dot.classList.add("visited");
          else dot.classList.remove("visited");
        }
      }
    }
  };

  const checkProximity = useCallback(
    (lat: number, lng: number) => {
      let closest: Place | null = null;
      let closestDist = Infinity;

      for (const place of places) {
        const d = haversineKm(lat, lng, place.lat, place.lng);
        if (d < closestDist) {
          closestDist = d;
          closest = place;
        }
      }

      setNearestPlace(closest);
      setNearestDist(closestDist);

      if (
        isRunningRef.current &&
        closest &&
        closestDist < PROXIMITY_KM &&
        !visitedRef.current.has(closest.id)
      ) {
        const newVisited = new Set(visitedRef.current);
        newVisited.add(closest.id);
        saveVisited(newVisited);
        setVisited(newVisited);
        visitedRef.current = newVisited;

        setStory({ place: closest, visible: true });
        setContinuityMsg(false);

        setTimeout(() => {
          setContinuityMsg(true);
        }, 1800);

        updatePlaceMarker(closest.id, true);
        unlockBadges(newVisited, false);
      }
    },
    [unlockBadges]
  );

  const moveMarkerSmooth = useCallback(
    (fromLat: number, fromLng: number, toLat: number, toLng: number, onDone: () => void) => {
      if (interpTimerRef.current) clearInterval(interpTimerRef.current);
      interpStepRef.current = 0;

      interpTimerRef.current = setInterval(() => {
        interpStepRef.current += 1;
        const t = interpStepRef.current / INTERP_STEPS;
        const pos = interpolate(
          { lat: fromLat, lng: fromLng },
          { lat: toLat, lng: toLng },
          t
        );

        if (markerRef.current) {
          markerRef.current.setLatLng([pos.lat, pos.lng]);
        }
        if (mapRef.current) {
          mapRef.current.panTo([pos.lat, pos.lng], { animate: false });
        }

        setCurrentPos(pos);
        checkProximity(pos.lat, pos.lng);

        if (interpStepRef.current >= INTERP_STEPS) {
          clearInterval(interpTimerRef.current!);
          interpTimerRef.current = null;
          onDone();
        }
      }, INTERP_INTERVAL_MS);
    },
    [checkProximity]
  );

  const runNextStep = useCallback(() => {
    const idx = stepIndexRef.current;
    if (idx >= demoPath.length - 1) {
      isRunningRef.current = false;
      setStatus("done");
      unlockBadges(visitedRef.current, true);
      return;
    }

    const from = demoPath[idx];
    const to = demoPath[idx + 1];
    const pct = ((idx + 1) / (demoPath.length - 1)) * 100;
    setProgressPct(pct);

    moveMarkerSmooth(from.lat, from.lng, to.lat, to.lng, () => {
      stepIndexRef.current = idx + 1;
      if (stepIndexRef.current < demoPath.length - 1) {
        stepTimerRef.current = setTimeout(runNextStep, 400);
      } else {
        isRunningRef.current = false;
        setStatus("done");
        setProgressPct(100);
        unlockBadges(visitedRef.current, true);
      }
    });
  }, [moveMarkerSmooth, unlockBadges]);

  const startJourney = useCallback(() => {
    if (status === "running") return;

    clearVisited();
    clearEarnedBadges();
    const freshVisited = new Set<string>();
    const freshBadges = new Set<string>();
    setVisited(freshVisited);
    visitedRef.current = freshVisited;
    setEarnedBadges(freshBadges);
    earnedBadgesRef.current = freshBadges;
    setBadgeQueue([]);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCurrentToast(null);

    for (const id of Object.keys(placeMarkersRef.current)) {
      updatePlaceMarker(id, false);
    }

    setStatus("running");
    isRunningRef.current = true;
    setStory(null);
    setContinuityMsg(false);
    setProgressPct(0);
    stepIndexRef.current = 0;

    const startPos = demoPath[0];
    if (markerRef.current) {
      markerRef.current.setLatLng([startPos.lat, startPos.lng]);
    }
    if (mapRef.current) {
      mapRef.current.setView([startPos.lat, startPos.lng], 11, { animate: true });
    }
    setCurrentPos(startPos);
    checkProximity(startPos.lat, startPos.lng);

    stepTimerRef.current = setTimeout(runNextStep, STEP_INTERVAL_MS);
  }, [status, runNextStep, checkProximity]);

  const resetJourney = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (interpTimerRef.current) clearInterval(interpTimerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    isRunningRef.current = false;

    clearVisited();
    clearEarnedBadges();
    const emptyVisited = new Set<string>();
    const emptyBadges = new Set<string>();
    setVisited(emptyVisited);
    visitedRef.current = emptyVisited;
    setEarnedBadges(emptyBadges);
    earnedBadgesRef.current = emptyBadges;
    setBadgeQueue([]);
    setCurrentToast(null);

    for (const id of Object.keys(placeMarkersRef.current)) {
      updatePlaceMarker(id, false);
    }

    stepIndexRef.current = 0;
    setStatus("idle");
    setStory(null);
    setContinuityMsg(false);
    setProgressPct(0);
    setFullStoryPlace(null);

    const startPos = demoPath[0];
    setCurrentPos(startPos);
    if (markerRef.current) {
      markerRef.current.setLatLng([startPos.lat, startPos.lng]);
    }
    if (mapRef.current) {
      mapRef.current.setView([startPos.lat, startPos.lng], 10, { animate: true });
    }
    checkProximity(startPos.lat, startPos.lng);
  }, [checkProximity]);

  useEffect(() => {
    if (mapRef.current) return;

    const startPos = demoPath[0];

    const map = L.map(mapContainerRef.current!, {
      center: [startPos.lat, startPos.lng],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markerIcon = L.divIcon({
      html: `<div style="position:relative;width:40px;height:40px;">
        <div class="pulse-ring"></div>
        <div class="pulse-ring pulse-ring-2"></div>
        <div class="marker-dot"></div>
      </div>`,
      className: "geo-marker-icon",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    const marker = L.marker([startPos.lat, startPos.lng], { icon: markerIcon }).addTo(map);
    markerRef.current = marker;

    for (const place of places) {
      const placeIcon = L.divIcon({
        html: `<div class="place-marker-dot"></div>`,
        className: "place-marker-icon",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const pm = L.marker([place.lat, place.lng], { icon: placeIcon }).addTo(map);
      pm.bindPopup(
        `<div style="direction:rtl;text-align:right;padding:4px 2px;">
          <div style="font-size:13px;font-weight:700;color:#c4a05a;margin-bottom:4px;">${place.name}</div>
          <div style="font-size:12px;color:#a09070;line-height:1.5;">${place.short}</div>
        </div>`,
        { closeButton: false, maxWidth: 220 }
      );
      placeMarkersRef.current[place.id] = pm;
    }

    mapRef.current = map;
    setCurrentPos(startPos);
    checkProximity(startPos.lat, startPos.lng);

    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      if (interpTimerRef.current) clearInterval(interpTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const formatDist = (km: number | null) => {
    if (km === null) return "—";
    if (km < 1) return `${Math.round(km * 1000)} م`;
    return `${km.toFixed(1)} كم`;
  };

  const formatCoord = (n: number) => n.toFixed(4);

  const statusLabel: Record<JourneyStatus, string> = {
    idle: "في الانتظار",
    running: "في الرحلة",
    done: "اكتملت",
  };

  const allVisited = places.every((p) => visited.has(p.id));

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Toggle button */}
      <button
        className="sidebar-toggle-btn"
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? "إخفاء اللوحة" : "إظهار اللوحة"}
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Mobile backdrop — tap to close */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`sidebar-panel${sidebarOpen ? "" : " sidebar-hidden"}`}>
        {/* Header */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid rgba(196,160,90,0.2)",
            background: "linear-gradient(180deg, rgba(196,160,90,0.08) 0%, transparent 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #c4a05a, #a07840)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                flexShrink: 0,
              }}
            >
              🗺️
            </div>
            <div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "900",
                  color: "var(--gold-light)",
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                }}
              >
                جيو راوي
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                رحلة عبر الزمن في الخرج
              </div>
            </div>
          </div>

          <div style={{ marginTop: "10px" }}>
            <span
              className={`status-badge ${
                status === "running" ? "active" : status === "done" ? "done" : "idle"
              }`}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background:
                    status === "running"
                      ? "#4ad090"
                      : status === "done"
                      ? "#a0a0ff"
                      : "var(--gold)",
                  display: "inline-block",
                  ...(status === "running"
                    ? { animation: "glowPulse 1.5s ease infinite" }
                    : {}),
                }}
              />
              {statusLabel[status]}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", flex: 1 }}>
          {/* Location info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <InfoRow
              icon="📍"
              label="الموقع الحالي"
              value={`${formatCoord(currentPos.lat)}، ${formatCoord(currentPos.lng)}`}
            />
            <div style={{ height: "1px", background: "rgba(196,160,90,0.1)" }} />
            <InfoRow
              icon="🏔️"
              label="المعلم القريب"
              value={nearestPlace ? nearestPlace.name : "—"}
              highlight={nearestPlace !== null && nearestDist !== null && nearestDist < PROXIMITY_KM}
            />
            <InfoRow
              icon="📏"
              label="المسافة"
              value={formatDist(nearestDist)}
              highlight={nearestDist !== null && nearestDist < PROXIMITY_KM}
            />
            {nearestPlace && (
              <InfoRow
                icon="📝"
                label="القصة المختصرة"
                value={nearestPlace.short}
                multiline
              />
            )}
          </div>

          {/* Progress bar */}
          {status === "running" && (
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                <span>مسار الرحلة</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPct}%`, transition: "width 0.8s ease" }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              className="btn-gold"
              onClick={startJourney}
              disabled={status === "running"}
            >
              🚗 بدء التجربة
            </button>

            {story && (
              <button
                className="btn-outline"
                onClick={() => setFullStoryPlace(story.place)}
              >
                📖 اقرأ القصة الكاملة
              </button>
            )}

            <button
              className="btn-outline"
              onClick={resetJourney}
              disabled={status === "running"}
            >
              🔁 إعادة التجربة
            </button>
          </div>

          {/* Landmarks */}
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--text-muted)",
                marginBottom: "10px",
                letterSpacing: "1px",
              }}
            >
              المعالم التاريخية
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {places.map((place) => {
                const isVisited = visited.has(place.id);
                return (
                  <div
                    key={place.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: isVisited
                        ? "rgba(42, 122, 90, 0.12)"
                        : "rgba(196,160,90,0.05)",
                      border: `1px solid ${
                        isVisited ? "rgba(42, 122, 90, 0.3)" : "rgba(196,160,90,0.15)"
                      }`,
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                    }}
                    onClick={() => {
                      if (mapRef.current) {
                        mapRef.current.flyTo([place.lat, place.lng], 13, {
                          animate: true,
                          duration: 1.2,
                        });
                      }
                      const pm = placeMarkersRef.current[place.id];
                      if (pm) pm.openPopup();
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: isVisited ? "#4ad090" : "var(--text-primary)",
                          lineHeight: 1.4,
                        }}
                      >
                        {place.name}
                      </div>
                      {isVisited && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#4ad090",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          ✔ تم
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* All visited celebration */}
          {allVisited && (
            <div
              className="animate-fadeInUp"
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "10px",
                background: "rgba(196,160,90,0.08)",
                border: "1px solid rgba(196,160,90,0.3)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "18px", marginBottom: "4px" }}>🌟</div>
              <div style={{ fontSize: "12px", color: "var(--gold)", fontWeight: "700" }}>
                اكتملت رحلتك التاريخية!
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                استكشفت جميع المعالم في الخرج
              </div>
            </div>
          )}

          {/* Badges section */}
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--text-muted)",
                marginBottom: "10px",
                letterSpacing: "1px",
              }}
            >
              الإنجازات
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {BADGES.map((badge) => {
                const isEarned = earnedBadges.has(badge.id);
                return (
                  <div key={badge.id} className={`badge-item ${isEarned ? "earned" : "locked"}`}>
                    <span style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>
                      {badge.emoji}
                    </span>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          color: isEarned ? "var(--gold-light)" : "var(--text-muted)",
                          marginBottom: "1px",
                        }}
                      >
                        {badge.name}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: isEarned ? "var(--text-secondary)" : "var(--text-muted)",
                          lineHeight: 1.4,
                        }}
                      >
                        {isEarned ? badge.description : "🔒 لم يُكتشف بعد"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Story card */}
      {story && story.visible && (
        <div className="story-card">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  fontWeight: "600",
                  letterSpacing: "1px",
                  marginBottom: "4px",
                }}
              >
                مشهد تاريخي
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "800",
                  color: "var(--gold-light)",
                  marginBottom: "2px",
                }}
              >
                📍 {story.place.sceneTitle}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                🏔️ {story.place.name}
              </div>
            </div>
            <button
              onClick={() => setStory(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "18px",
                padding: "2px 6px",
                lineHeight: 1,
                borderRadius: "4px",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          <div className="separator" />

          <div
            style={{
              fontSize: "13.5px",
              color: "var(--text-primary)",
              lineHeight: "1.9",
              fontWeight: "400",
              fontStyle: "italic",
            }}
          >
            "{story.place.story.slice(0, 180)}..."
          </div>

          {continuityMsg && (
            <div
              className="animate-fadeIn"
              style={{
                marginTop: "12px",
                fontSize: "12px",
                color: "var(--gold)",
                fontStyle: "italic",
                textAlign: "center",
                opacity: 0.8,
              }}
            >
              ✦ تستمر رحلتك عبر الزمن... ✦
            </div>
          )}

          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <button
              className="btn-outline"
              style={{ fontSize: "12px", padding: "7px 12px" }}
              onClick={() => setFullStoryPlace(story.place)}
            >
              📖 القصة الكاملة
            </button>
            <button
              className="btn-outline"
              style={{ fontSize: "12px", padding: "7px 12px" }}
              onClick={() => setStory(null)}
            >
              متابعة الرحلة ←
            </button>
          </div>
        </div>
      )}

      {/* Full story modal */}
      {fullStoryPlace && (
        <div
          className="animate-fadeIn"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullStoryPlace(null);
          }}
        >
          <div
            className="animate-fadeInUp"
            style={{
              width: "min(560px, 100%)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-gold)",
              borderRadius: "20px",
              padding: "32px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
              position: "relative",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
                borderRadius: "20px 20px 0 0",
              }}
            />

            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  letterSpacing: "2px",
                  marginBottom: "8px",
                }}
              >
                ✦ وثيقة تاريخية ✦
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: "900",
                  color: "var(--gold-light)",
                  marginBottom: "6px",
                }}
              >
                {fullStoryPlace.sceneTitle}
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                🏔️ {fullStoryPlace.name}
              </div>
            </div>

            <div className="separator" />

            <div
              style={{
                fontSize: "15px",
                color: "var(--text-primary)",
                lineHeight: "2.0",
                fontWeight: "400",
                marginTop: "16px",
              }}
            >
              {fullStoryPlace.story}
            </div>

            <div className="separator" />

            <div
              style={{
                fontSize: "12px",
                color: "var(--gold)",
                fontStyle: "italic",
                textAlign: "center",
                opacity: 0.7,
                marginBottom: "16px",
              }}
            >
              ✦ تستمر رحلتك عبر الزمن... ✦
            </div>

            <button className="btn-gold" onClick={() => setFullStoryPlace(null)}>
              العودة إلى الرحلة
            </button>
          </div>
        </div>
      )}

      {/* Badge popup toast */}
      {currentToast && (
        <div className={`badge-popup${currentToast.leaving ? " leaving" : ""}`}>
          <div className="badge-popup-label">🏆 إنجاز جديد!</div>
          <span className="badge-popup-emoji">{currentToast.badge.emoji}</span>
          <div className="badge-popup-name">{currentToast.badge.name}</div>
          <div className="badge-popup-divider" />
          <div className="badge-popup-desc">{currentToast.badge.description}</div>
        </div>
      )}
    </div>
  );
}

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
  multiline?: boolean;
}

function InfoRow({ icon, label, value, highlight = false, multiline = false }: InfoRowProps) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: "600", marginBottom: "3px" }}>
        {icon} {label}
      </div>
      <div
        style={{
          fontSize: multiline ? "12px" : "13px",
          color: highlight ? "#4ad090" : "var(--text-primary)",
          fontWeight: highlight ? "600" : "400",
          lineHeight: multiline ? "1.6" : "1.4",
          transition: "color 0.3s ease",
        }}
      >
        {value}
      </div>
    </div>
  );
}
