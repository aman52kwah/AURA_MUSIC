import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Play, Pause, Music, Settings2, Sparkles, Zap, Ghost, Maximize, Minimize, Search, Volume2, VolumeX, Plus, ListMusic, Trash2, ChevronRight, X, Loader2 } from 'lucide-react';

// --- Types ---
type Vibe = 'Synthwave' | 'Minimalist' | 'Electric';

interface Track {
  id: string;
  name: string;
  artist?: string;
  url?: string;
  file?: File;
  artwork?: string;
  isFullTrack?: boolean;
}

interface VibeConfig {
  background: string;
  helix1Color: string;
  helix2Color: string;
  rungColor: string;
  glowIntensity: number;
  particleColor: string;
}

const VIBES: Record<Vibe, VibeConfig> = {
  Synthwave: {
    background: '#05010a',
    helix1Color: '#ff00ff',
    helix2Color: '#00ffff',
    rungColor: '#ffffff',
    glowIntensity: 2,
    particleColor: '#ff00ff',
  },
  Minimalist: {
    background: '#f0f0f0',
    helix1Color: '#333333',
    helix2Color: '#666666',
    rungColor: '#999999',
    glowIntensity: 0.2,
    particleColor: '#333333',
  },
  Electric: {
    background: '#000510',
    helix1Color: '#00ffcc',
    helix2Color: '#ffff00',
    rungColor: '#00ccff',
    glowIntensity: 1.5,
    particleColor: '#00ffcc',
  },
};

// --- Components ---

export default function App() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vibe, setVibe] = useState<Vibe>('Synthwave');
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dnaGroupRef = useRef<THREE.Group | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);

  const [isDecoding, setIsDecoding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Persistence Logic ---

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('aura_playlist');
    if (savedPlaylist) {
      try {
        setPlaylist(JSON.parse(savedPlaylist));
      } catch (e) {
        console.error("Failed to load playlist", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('aura_playlist', JSON.stringify(playlist));
  }, [playlist]);

  // --- Fullscreen Logic ---

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // --- Audio Logic ---

  const initAudio = async (track: Track, autoPlay: boolean = false) => {
    setIsDecoding(true);
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyzer = context.createAnalyser();
      const gainNode = context.createGain();
      
      analyzer.fftSize = 256;
      gainNode.gain.value = volume;
      
      let arrayBuffer: ArrayBuffer;
      if (track.file) {
        arrayBuffer = await track.file.arrayBuffer();
      } else if (track.url) {
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error("No audio source found");
      }

      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      
      audioContextRef.current = context;
      analyzerRef.current = analyzer;
      gainNodeRef.current = gainNode;
      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      
      setCurrentTrack(track);
      pausedAtRef.current = 0;
      setCurrentTime(0);

      if (autoPlay) {
        // We need to wait a bit for state to settle or just call playAudio directly with refs
        // Since playAudio uses refs, we can call it after setting refs
        setIsPlaying(true);
        // We'll call playAudio in a timeout to ensure state is updated if needed, 
        // but playAudio mostly uses refs so it should be fine.
        setTimeout(() => {
          playAudio();
        }, 100);
      } else {
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("Failed to decode audio", err);
      alert("Failed to load audio. This might be due to CORS restrictions or an invalid file.");
    } finally {
      setIsDecoding(false);
    }
  };

  const playNextTrack = () => {
    if (playlist.length === 0 || !currentTrack) return;
    
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    // If not in playlist or last track, we might want to loop or stop
    // For now, let's play the next one if it exists
    if (currentIndex !== -1 && currentIndex < playlist.length - 1) {
      const nextTrack = playlist[currentIndex + 1];
      initAudio(nextTrack, true);
    }
  };

  const playAudio = () => {
    if (!audioContextRef.current || !audioBufferRef.current || !analyzerRef.current || !gainNodeRef.current) return;

    if (sourceRef.current) {
      sourceRef.current.stop();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    
    // Chain: Source -> Gain -> Analyzer -> Destination
    source.connect(gainNodeRef.current);
    gainNodeRef.current.connect(analyzerRef.current);
    analyzerRef.current.connect(audioContextRef.current.destination);

    const offset = pausedAtRef.current;
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime - offset;
    sourceRef.current = source;
    setIsPlaying(true);

    source.onended = () => {
      if (audioContextRef.current && audioBufferRef.current && (audioContextRef.current.currentTime - startTimeRef.current >= audioBufferRef.current.duration - 0.1)) {
        setIsPlaying(false);
        pausedAtRef.current = 0;
        setCurrentTime(0);
        
        // Auto-play next track if in playlist
        playNextTrack();
      }
    };

    const updateData = () => {
      if (!analyzerRef.current || !audioContextRef.current) return;
      
      // Update frequency data
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      setAudioData(new Uint8Array(dataArray));

      // Update current time
      const current = audioContextRef.current.currentTime - startTimeRef.current;
      setCurrentTime(current);

      animationFrameRef.current = requestAnimationFrame(updateData);
    };
    updateData();
  };

  const seekAudio = (time: number) => {
    if (!audioContextRef.current || !audioBufferRef.current) return;
    
    const wasPlaying = isPlaying;
    if (wasPlaying) pauseAudio();
    
    pausedAtRef.current = Math.max(0, Math.min(time, audioBufferRef.current.duration));
    setCurrentTime(pausedAtRef.current);
    
    if (wasPlaying) playAudio();
  };

  const updateVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(newVolume, audioContextRef.current?.currentTime || 0, 0.1);
    }
  };

  const pauseAudio = () => {
    if (!sourceRef.current || !audioContextRef.current) return;
    sourceRef.current.stop();
    pausedAtRef.current = audioContextRef.current.currentTime - startTimeRef.current;
    setIsPlaying(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  // --- Three.js Logic ---

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(VIBES[vibe].background);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 15;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // DNA Spiral
    const dnaGroup = new THREE.Group();
    const helixCount = 40;
    const helixRadius = 3;
    const helixHeight = 15;
    
    const helix1Geometry = new THREE.SphereGeometry(0.15, 8, 8);
    const helix2Geometry = new THREE.SphereGeometry(0.15, 8, 8);
    const rungGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);

    const helix1Material = new THREE.MeshBasicMaterial({ color: VIBES[vibe].helix1Color });
    const helix2Material = new THREE.MeshBasicMaterial({ color: VIBES[vibe].helix2Color });
    const rungMaterial = new THREE.MeshBasicMaterial({ color: VIBES[vibe].rungColor, transparent: true, opacity: 0.5 });

    for (let i = 0; i < helixCount; i++) {
      const y = (i / helixCount) * helixHeight - helixHeight / 2;
      const angle = (i / helixCount) * Math.PI * 4;

      // Helix 1
      const sphere1 = new THREE.Mesh(helix1Geometry, helix1Material);
      sphere1.position.set(Math.cos(angle) * helixRadius, y, Math.sin(angle) * helixRadius);
      dnaGroup.add(sphere1);

      // Helix 2
      const sphere2 = new THREE.Mesh(helix2Geometry, helix2Material);
      sphere2.position.set(Math.cos(angle + Math.PI) * helixRadius, y, Math.sin(angle + Math.PI) * helixRadius);
      dnaGroup.add(sphere2);

      // Rungs
      const rung = new THREE.Mesh(rungGeometry, rungMaterial);
      rung.position.set(0, y, 0);
      rung.rotation.z = Math.PI / 2;
      rung.rotation.y = angle;
      rung.scale.set(1, helixRadius * 2, 1);
      dnaGroup.add(rung);
    }
    scene.add(dnaGroup);
    dnaGroupRef.current = dnaGroup;

    // Particles
    const particleCount = 500;
    const particlesGeometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 40;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.05,
      color: VIBES[vibe].particleColor,
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
    particlesRef.current = particles;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Animation Loop
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      
      if (dnaGroupRef.current) {
        dnaGroupRef.current.rotation.y += 0.005;
        
        // React to audio
        if (analyzerRef.current && isPlaying) {
          const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
          analyzerRef.current.getByteFrequencyData(dataArray);
          
          const avgFreq = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const bassFreq = dataArray[0] / 255;
          const midFreq = dataArray[Math.floor(dataArray.length / 2)] / 255;

          const scale = 1 + bassFreq * 0.3;
          dnaGroupRef.current.scale.set(scale, scale, scale);
          
          // Animate individual spheres/rungs
          dnaGroupRef.current.children.forEach((child, idx) => {
            const freqIndex = idx % dataArray.length;
            const intensity = dataArray[freqIndex] / 255;
            
            if (child instanceof THREE.Mesh) {
              if (child.geometry.type === 'SphereBufferGeometry' || child.geometry.type === 'SphereGeometry') {
                const s = 1 + intensity * 1.5;
                child.scale.set(s, s, s);
              } else if (child.geometry.type === 'CylinderBufferGeometry' || child.geometry.type === 'CylinderGeometry') {
                (child.material as THREE.MeshBasicMaterial).opacity = 0.1 + intensity * 0.9;
              }
            }
          });

          if (particlesRef.current) {
            particlesRef.current.rotation.y += 0.002 + midFreq * 0.02;
            particlesRef.current.scale.set(1 + bassFreq * 0.1, 1 + bassFreq * 0.1, 1 + bassFreq * 0.1);
          }
        } else {
          // Idle animation
          dnaGroupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
          dnaGroupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              child.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
              if (child.geometry.type === 'CylinderGeometry') {
                (child.material as THREE.MeshBasicMaterial).opacity = 0.3;
              }
            }
          });
        }
      }

      if (particlesRef.current) {
        particlesRef.current.rotation.y += 0.001;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frame);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Vibe
  useEffect(() => {
    if (!sceneRef.current || !dnaGroupRef.current || !particlesRef.current) return;
    
    const config = VIBES[vibe];
    sceneRef.current.background = new THREE.Color(config.background);
    
    dnaGroupRef.current.children.forEach((child, idx) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (idx % 3 === 0) mat.color.set(config.helix1Color);
        else if (idx % 3 === 1) mat.color.set(config.helix2Color);
        else mat.color.set(config.rungColor);
      }
    });

    (particlesRef.current.material as THREE.PointsMaterial).color.set(config.particleColor);
  }, [vibe]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('audio/')) {
      const track: Track = {
        id: Math.random().toString(36).substr(2, 9),
        name: droppedFile.name,
        file: droppedFile,
        isFullTrack: true
      };
      initAudio(track);
    }
  };

  const searchMusic = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      // 1. Try iTunes (Best for mainstream artists like Kirk Franklin)
      const itunesResponse = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&limit=20`);
      const itunesData = await itunesResponse.json();
      
      let allTracks: Track[] = [];
      
      if (itunesData.results && itunesData.results.length > 0) {
        allTracks = itunesData.results.map((item: any) => ({
          id: item.trackId ? `itunes_${item.trackId}` : `itunes_${Math.random()}`,
          name: item.trackName,
          artist: item.artistName,
          url: item.previewUrl,
          artwork: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '600x600') : undefined,
          isFullTrack: false
        }));
      }

      // 2. Also try Jamendo (Best for full tracks/independent music)
      try {
        const jamendoResponse = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=56d30cce&format=json&limit=10&fuzzysearch=${encodeURIComponent(searchQuery)}&include=musicinfo&audioformat=mp32`);
        const jamendoData = await jamendoResponse.json();
        if (jamendoData.results && jamendoData.results.length > 0) {
          const jamendoTracks = jamendoData.results.map((item: any) => ({
            id: `jamendo_${item.id}`,
            name: item.name,
            artist: item.artist_name,
            url: item.audio,
            artwork: item.image || item.album_image,
            isFullTrack: true
          }));
          allTracks = [...allTracks, ...jamendoTracks];
        }
      } catch (e) {
        console.error("Jamendo fallback failed", e);
      }

      // Sort to prioritize full tracks
      allTracks.sort((a, b) => (b.isFullTrack ? 1 : 0) - (a.isFullTrack ? 1 : 0));

      setSearchResults(allTracks);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addToPlaylist = (track: Track) => {
    if (!playlist.find(t => t.id === track.id)) {
      setPlaylist([...playlist, track]);
    }
  };

  const removeFromPlaylist = (id: string) => {
    setPlaylist(playlist.filter(t => t.id !== id));
  };

  return (
    <div 
      className="relative w-full h-screen overflow-hidden bg-black text-white font-sans"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Overlay UI */}
      <div className={`relative z-10 flex flex-col h-full transition-opacity duration-500 ${isFullscreen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-none'}`}>
        
        {/* Header */}
        <header className="p-8 flex justify-between items-start">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col"
          >
            <h1 className="text-4xl font-black tracking-tighter italic flex items-center gap-2">
              AURA <Sparkles className="w-6 h-6 text-purple-400" />
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40 font-medium">
              3D Spatial Visualizer
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-4 pointer-events-auto"
          >
            <button 
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-3 rounded-full transition-all border ${isSearchOpen ? 'bg-white text-black border-white' : 'bg-black/20 text-white/60 border-white/10 hover:border-white/30'}`}
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
              className={`p-3 rounded-full transition-all border ${isPlaylistOpen ? 'bg-white text-black border-white' : 'bg-black/20 text-white/60 border-white/10 hover:border-white/30'}`}
            >
              <ListMusic className="w-5 h-5" />
            </button>
            {(['Synthwave', 'Minimalist', 'Electric'] as Vibe[]).map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all border ${
                  vibe === v 
                    ? 'bg-white text-black border-white' 
                    : 'bg-black/20 text-white/60 border-white/10 hover:border-white/30'
                }`}
              >
                {v}
              </button>
            ))}
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-8 relative">
          {/* Current Track Info Display (Left Side) */}
          <AnimatePresence>
            {currentTrack && !isFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: -100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-6 max-w-xs pointer-events-none"
              >
                <div className="relative group">
                  <motion.div 
                    animate={{ rotate: isPlaying ? 360 : 0 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-64 h-64 rounded-full overflow-hidden border-8 border-white/5 shadow-2xl shadow-purple-500/20"
                  >
                    {currentTrack.artwork ? (
                      <img src={currentTrack.artwork} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <Music className="w-24 h-24 text-white/20" />
                      </div>
                    )}
                  </motion.div>
                  <div className="absolute inset-0 rounded-full border-4 border-white/10 pointer-events-none" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tighter leading-tight truncate">
                    {currentTrack.name}
                  </h2>
                  <p className="text-lg font-medium text-white/40 uppercase tracking-widest truncate">
                    {currentTrack.artist || 'Unknown Artist'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isSearchOpen && (
              <motion.div
                key="search-panel"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="absolute left-8 top-0 bottom-0 w-96 bg-black/60 backdrop-blur-3xl border-r border-white/10 z-20 p-6 flex flex-col gap-6 pointer-events-auto"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">Search Music</h2>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Mainstream tracks are 30s previews</p>
                  </div>
                  <button onClick={() => setIsSearchOpen(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Search artist or song..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 outline-none focus:border-white/30 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchMusic()}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {searchQuery && (
                      <button 
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        className="text-white/20 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={searchMusic}
                      className="text-white/40 hover:text-white transition-colors"
                    >
                      {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {isSearching ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                      <Loader2 className="w-12 h-12 animate-spin" />
                      <p className="text-xs uppercase tracking-widest">Searching...</p>
                    </div>
                  ) : searchResults.length === 0 && searchQuery ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                      <Search className="w-12 h-12" />
                      <p className="text-xs uppercase tracking-widest">No results found</p>
                    </div>
                  ) : (
                    searchResults.map(track => (
                      <div key={track.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all">
                        {track.artwork ? (
                          <img src={track.artwork} alt="" className="w-10 h-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate">{track.name}</p>
                            {track.isFullTrack ? (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400 font-bold uppercase tracking-tighter">Full</span>
                            ) : (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-white/10 text-white/40 font-bold uppercase tracking-tighter">30s</span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/40 truncate uppercase tracking-wider">{track.artist}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => addToPlaylist(track)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"><Plus className="w-4 h-4" /></button>
                          <button onClick={() => initAudio(track, true)} className="p-2 rounded-lg bg-white text-black hover:scale-105"><Play className="w-4 h-4 fill-current" /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {isPlaylistOpen && (
              <motion.div
                key="playlist-panel"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute right-8 top-0 bottom-0 w-96 bg-black/60 backdrop-blur-3xl border-l border-white/10 z-20 p-6 flex flex-col gap-6 pointer-events-auto"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Your Playlist</h2>
                  <button onClick={() => setIsPlaylistOpen(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {playlist.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                      <ListMusic className="w-12 h-12" />
                      <p className="text-xs uppercase tracking-widest">Playlist is empty</p>
                    </div>
                  ) : (
                    playlist.map(track => (
                      <div key={track.id} className={`group flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all ${currentTrack?.id === track.id ? 'bg-white/10' : ''}`}>
                        {track.artwork ? (
                          <img src={track.artwork} alt="" className="w-10 h-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate">{track.name}</p>
                            {track.isFullTrack ? (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400 font-bold uppercase tracking-tighter">Full</span>
                            ) : (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-white/10 text-white/40 font-bold uppercase tracking-tighter">30s</span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/40 truncate uppercase tracking-wider">{track.artist || 'Local File'}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => removeFromPlaylist(track.id)} className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                          <button onClick={() => initAudio(track, true)} className="p-2 rounded-lg bg-white text-black hover:scale-105"><Play className="w-4 h-4 fill-current" /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {isDecoding ? (
              <motion.div
                key="decoding"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-xs uppercase tracking-[0.3em] font-bold text-white/40">Decoding Audio...</p>
              </motion.div>
            ) : !currentTrack ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="w-full max-w-md p-12 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 backdrop-blur-xl flex flex-col items-center text-center gap-6 pointer-events-auto cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-white/60" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Drop your sound</h2>
                  <p className="text-white/40 text-sm">Drag and drop an MP3 file or click to browse</p>
                </div>
                <input 
                  id="file-input"
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const track: Track = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        file: file
                      };
                      initAudio(track);
                    }
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="player"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-xl px-8 pointer-events-auto"
              >
                <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-6">
                    {currentTrack.artwork ? (
                      <img src={currentTrack.artwork} alt="" className="w-16 h-16 rounded-xl object-cover shadow-lg shadow-purple-500/20" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
                        <Music className="w-8 h-8 text-white" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate text-lg">{currentTrack.name}</h3>
                      <p className="text-white/40 text-xs uppercase tracking-widest font-medium">
                        {currentTrack.artist || (isPlaying ? 'Now Playing' : 'Paused')}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 bg-white/5 rounded-full px-4 py-2 group">
                        {volume === 0 ? <VolumeX className="w-4 h-4 text-white/40 cursor-pointer" onClick={() => updateVolume(0.8)} /> : <Volume2 className="w-4 h-4 text-white/40 cursor-pointer" onClick={() => updateVolume(0)} />}
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.01" 
                          value={volume}
                          onChange={(e) => updateVolume(parseFloat(e.target.value))}
                          className="w-20 accent-white cursor-pointer"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          pauseAudio();
                          setCurrentTrack(null);
                        }}
                        className="p-3 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                      >
                        <Ghost className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={isPlaying ? pauseAudio : playAudio}
                        className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl"
                      >
                        {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current ml-1" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                    <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden group cursor-pointer">
                      <input 
                        type="range"
                        min="0"
                        max={duration || 100}
                        value={currentTime}
                        onChange={(e) => seekAudio(parseFloat(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                      />
                      <motion.div 
                        className="absolute h-full bg-white rounded-full"
                        style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Frequency Bars */}
                  <div className="h-8 flex items-end gap-1 px-1">
                    {Array.from({ length: 32 }).map((_, i) => {
                      const val = audioData ? audioData[i * 2] : 0;
                      const height = Math.max(10, (val / 255) * 100);
                      return (
                        <motion.div
                          key={i}
                          animate={{ height: `${height}%` }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          className="flex-1 rounded-t-sm"
                          style={{ 
                            backgroundColor: i % 2 === 0 ? VIBES[vibe].helix1Color : VIBES[vibe].helix2Color,
                            opacity: 0.3 + (val / 255) * 0.7
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer Info */}
        <footer className="p-8 flex justify-between items-end text-[10px] uppercase tracking-[0.4em] text-white/20 font-bold">
          <div className="flex gap-8 pointer-events-auto">
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3" /> 256 FFT
            </div>
            <div className="flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> Web Audio API
            </div>
            <button 
              onClick={toggleFullscreen}
              className="flex items-center gap-2 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>
          <div>
            &copy; 2026 Aura Visuals
          </div>
        </footer>
      </div>

      {/* Persistent Fullscreen Toggle (Visible on hover when in fullscreen) */}
      {isFullscreen && (
        <div className="fixed top-8 right-8 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={toggleFullscreen}
            className="p-4 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-white/40 hover:text-white transition-all"
          >
            <Minimize className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Background Glow */}
      <div 
        className="absolute inset-0 z-[-1] opacity-30 blur-[120px] pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${VIBES[vibe].helix1Color}, transparent 70%)`
        }}
      />
    </div>
  );
}
