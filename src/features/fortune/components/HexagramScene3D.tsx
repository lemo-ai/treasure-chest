import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Stars } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import { hexagramLines } from './FortuneSummary'
import styles from './HexagramScene3D.module.css'

function useAccentColors(wrapRef: React.RefObject<HTMLDivElement | null>): {
  primary: string
  secondary: string
} {
  const [colors, setColors] = useState({ primary: '#0d9488', secondary: '#0f766e' })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const read = (): void => {
      const cs = getComputedStyle(el)
      setColors({
        primary: cs.getPropertyValue('--hero-accent').trim() || '#0d9488',
        secondary: cs.getPropertyValue('--hero-accent-2').trim() || '#0f766e',
      })
    }

    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [wrapRef])

  return colors
}

interface SceneProps {
  hexagramId: number
  colors: { primary: string; secondary: string }
  pointerRef: MutableRefObject<{ x: number; y: number }>
  reducedMotion: boolean
}

function YaoBar({
  yang,
  y,
  color,
  emissive,
}: {
  yang: boolean
  y: number
  color: string
  emissive: string
}): React.JSX.Element {
  const mat = useMemo(
    () => ({
      color,
      emissive,
      emissiveIntensity: 0.55,
      metalness: 0.72,
      roughness: 0.22,
    }),
    [color, emissive],
  )

  if (yang) {
    return (
      <mesh position={[0, y, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.85, 0.14, 0.2]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    )
  }

  return (
    <group position={[0, y, 0]}>
      <mesh position={[-0.56, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.68, 0.14, 0.2]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0.56, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.68, 0.14, 0.2]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  )
}

function HexagramCore({
  hexagramId,
  colors,
  pointerRef,
  reducedMotion,
}: SceneProps): React.JSX.Element {
  const lines = useMemo(() => hexagramLines(hexagramId), [hexagramId])
  const rootRef = useRef<Group>(null)
  const ringRef = useRef<Mesh>(null)
  const ringBRef = useRef<Mesh>(null)

  useFrame((_state, delta) => {
    const root = rootRef.current
    if (!root) return

    const pointer = pointerRef.current
    const targetX = reducedMotion ? 0.12 : pointer.y * -0.55 + 0.12
    const targetY = reducedMotion ? 0 : pointer.x * 0.65
    root.rotation.x += (targetX - root.rotation.x) * (reducedMotion ? 1 : 0.08)
    root.rotation.y += (targetY - root.rotation.y) * (reducedMotion ? 1 : 0.08)

    if (!reducedMotion) {
      root.rotation.y += delta * 0.22
      if (ringRef.current) ringRef.current.rotation.z += delta * 0.35
      if (ringBRef.current) ringBRef.current.rotation.x -= delta * 0.28
    }
  })

  return (
    <group ref={rootRef}>
      <Float speed={reducedMotion ? 0 : 1.6} rotationIntensity={0.15} floatIntensity={0.35}>
        <group>
          {lines.map((yang, index) => (
            <YaoBar
              key={index}
              yang={yang}
              y={(index - 2.5) * 0.34}
              color={colors.primary}
              emissive={colors.secondary}
            />
          ))}
        </group>
      </Float>

      <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0.2, 0]}>
        <torusGeometry args={[2.35, 0.028, 12, 96]} />
        <meshStandardMaterial
          color={colors.secondary}
          emissive={colors.primary}
          emissiveIntensity={0.35}
          metalness={0.9}
          roughness={0.15}
          transparent
          opacity={0.85}
        />
      </mesh>

      <mesh ref={ringBRef} rotation={[Math.PI / 3.1, 0.8, 0.4]}>
        <torusGeometry args={[2.05, 0.016, 10, 80]} />
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.secondary}
          emissiveIntensity={0.25}
          metalness={0.85}
          roughness={0.2}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  )
}

function Scene(props: SceneProps): React.JSX.Element {
  const { colors } = props

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[4, 4, 5]} intensity={1.1} color={colors.primary} />
      <pointLight position={[-4, -2, 3]} intensity={0.65} color={colors.secondary} />
      <spotLight position={[0, 5, 2]} angle={0.45} penumbra={0.6} intensity={0.85} color="#ffffff" />
      <Stars radius={28} depth={40} count={props.reducedMotion ? 0 : 280} factor={2} saturation={0} fade speed={0.5} />
      <HexagramCore {...props} />
    </>
  )
}

interface HexagramScene3DProps {
  hexagramId: number
  name: string
  pointerRef: MutableRefObject<{ x: number; y: number }>
  reducedMotion?: boolean
}

export function HexagramScene3D({
  hexagramId,
  name,
  pointerRef,
  reducedMotion = false,
}: HexagramScene3DProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const colors = useAccentColors(wrapRef)

  return (
    <div ref={wrapRef} className={styles.wrap} aria-hidden>
      <Canvas
        className={styles.canvas}
        camera={{ position: [0, 0, 5.2], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <Suspense fallback={null}>
          <Scene
            hexagramId={hexagramId}
            colors={colors}
            pointerRef={pointerRef}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>
      <span className={styles.name}>{name}</span>
    </div>
  )
}
