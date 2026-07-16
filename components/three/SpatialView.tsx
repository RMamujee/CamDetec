"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export interface SpatialObject {
  id: number;
  cls: string;
  pest: boolean;
  x: number;
  z: number;
  height: number;
  size: number;
}

export interface SpatialFigure {
  id: number;
  x: number;
  z: number;
  segments: [[number, number], [number, number]][];
  head: [number, number] | null;
  hands: [number, number][];
  feet: [number, number][];
}

export interface SpatialMarker {
  id: string;
  x: number;
  z: number;
  radius: number;
  ingress: boolean;
  high: boolean;
}

const COOL = "#57c7cf";
const WARM = "#ff8a3d";
const HOT = "#ff4d4f";
const BONE = "#d6ecec";
const HAND_FOOT = "#8fe3e8";

function Contact({ o }: { o: SpatialObject }) {
  const color = o.pest ? WARM : COOL;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh position={[0, o.height / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.12, o.height, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[o.size * 0.75, o.size, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Figure({ f }: { f: SpatialFigure }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (const seg of f.segments) {
      pts.push(seg[0][0], seg[0][1], 0, seg[1][0], seg[1][1], 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [f.segments]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[f.x, 0, f.z]}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={BONE} linewidth={2} />
      </lineSegments>
      {f.head && (
        <mesh position={[f.head[0], f.head[1], 0]}>
          <sphereGeometry args={[0.13, 10, 10]} />
          <meshBasicMaterial color={COOL} />
        </mesh>
      )}
      {f.hands.map((h, i) => (
        <mesh key={`h${i}`} position={[h[0], h[1], 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial color={HAND_FOOT} />
        </mesh>
      ))}
      {f.feet.map((ft, i) => (
        <mesh key={`f${i}`} position={[ft[0], ft[1], 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color={HAND_FOOT} />
        </mesh>
      ))}
    </group>
  );
}

function Marker({ m }: { m: SpatialMarker }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current && m.high) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.12;
      ref.current.scale.set(s, s, s);
    }
  });
  if (m.ingress) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[m.x, 0.03, m.z]}>
        <ringGeometry args={[m.radius * 0.7, m.radius, 40]} />
        <meshBasicMaterial color={COOL} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
    );
  }
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[m.x, 0.03, m.z]}>
      <circleGeometry args={[m.radius, 32]} />
      <meshBasicMaterial
        color={m.high ? HOT : WARM}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function CameraRig() {
  const geo = useMemo(() => {
    const apex = new THREE.Vector3(0, 4, 9.2);
    const corners = [
      new THREE.Vector3(-6, 0, -7),
      new THREE.Vector3(6, 0, -7),
      new THREE.Vector3(6, 0, 7),
      new THREE.Vector3(-6, 0, 7),
    ];
    const pts: number[] = [];
    for (const c of corners) pts.push(apex.x, apex.y, apex.z, c.x, c.y, c.z);
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={COOL} transparent opacity={0.22} />
      </lineSegments>
      <mesh position={[0, 4, 9.2]}>
        <boxGeometry args={[0.55, 0.45, 0.8]} />
        <meshBasicMaterial color={COOL} wireframe />
      </mesh>
    </group>
  );
}

function Scene({
  objects,
  figures,
  markers,
}: {
  objects: SpatialObject[];
  figures: SpatialFigure[];
  markers: SpatialMarker[];
}) {
  return (
    <>
      <color attach="background" args={["#090c0d"]} />
      <fog attach="fog" args={["#090c0d", 22, 50]} />
      <ambientLight intensity={0.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial color="#0c1214" />
      </mesh>
      <gridHelper args={[26, 26, "#2a353a", "#141b1e"]} />
      <CameraRig />
      {markers.map((m) => (
        <Marker key={m.id} m={m} />
      ))}
      {objects.map((o) => (
        <Contact key={o.id} o={o} />
      ))}
      {figures.map((f) => (
        <Figure key={f.id} f={f} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={36}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export default function SpatialView({
  objects,
  figures,
  markers,
}: {
  objects: SpatialObject[];
  figures: SpatialFigure[];
  markers: SpatialMarker[];
}) {
  return (
    <Canvas
      className="spatial-canvas"
      camera={{ position: [0, 11, 16], fov: 46 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <Scene objects={objects} figures={figures} markers={markers} />
    </Canvas>
  );
}
