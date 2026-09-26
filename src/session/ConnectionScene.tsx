import { useEffect, useRef, type ComponentProps } from 'react';
import { gsap } from 'gsap';
import { ConnectionForm } from './ConnectionForm';
import styles from './ConnectionScene.module.css';

const decorations = [
  { name: 'minimal', text: 'Сделал минимальный интерфейс по ТЗ', depth: 9, direction: 1 },
  { name: 'parallax', text: 'Немножечко добавил параллакс', depth: 16, direction: -1 },
  { name: 'call', text: 'Ну что, созвонимся?', depth: 7, direction: -1 },
  { name: 'voice', text: 'Тут могло бы быть голосовое... Но его нет в ТЗ', depth: 12, direction: 1 },
  { name: 'plane', image: 'plane', depth: 24, direction: 1 },
  { name: 'connector', image: 'connector', depth: 14, direction: -1 },
  { name: 'bubble', image: 'bubble', depth: 19, direction: 1 },
];

type Props = ComponentProps<typeof ConnectionForm> & { onEntered: () => void };

export function ConnectionScene({ onEntered, ...props }: Props) {
  const root = useRef<HTMLElement>(null);
  const paused = useRef(false);
  const completedFields = useRef(new Set<string>());
  const stepPlane = useRef<(() => void) | null>(null);
  const exiting = props.connectionState === 'connected';

  useEffect(() => {
    const scene = root.current!;
    const media = gsap.matchMedia();
    media.add('(min-width: 1100px) and (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', () => {
      const items = Array.from(scene.querySelectorAll<HTMLElement>('[data-decoration]'));
      const motion = items.map((item, index) => {
        const layer = item.querySelector<HTMLElement>('[data-parallax]')!;
        const float = item.querySelector<HTMLElement>('[data-float]')!;
        gsap.from(item, { opacity: 0, y: 12, duration: 0.45, delay: index * 0.035 });
        return {
          layer, float,
          depth: Number(item.dataset.depth) * Number(item.dataset.direction),
          phase: index * 0.9, period: 5 + index / 3, amplitude: index % 2 ? 4 : 6,
          setX: gsap.quickSetter(layer, 'x', 'px'),
          setY: gsap.quickSetter(layer, 'y', 'px'),
          setRotation: gsap.quickSetter(layer, 'rotation', 'deg'),
          setFloat: gsap.quickSetter(float, 'y', 'px'),
          plane: item.dataset.decoration === 'plane',
        };
      });
      const pointer = { x: 0, y: 0, currentX: 0, currentY: 0, strength: 1 };
      const move = (event: PointerEvent) => {
        const bounds = scene.getBoundingClientRect();
        pointer.x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
        pointer.y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      };
      const leave = () => { pointer.x = 0; pointer.y = 0; };
      // Preserve the floating phase instead of restarting tweens on pointer events.
      const render = (time: number, delta: number) => {
        const blend = 1 - Math.exp(-Math.min(delta, 64) / 420);
        pointer.currentX += ((paused.current ? 0 : pointer.x) - pointer.currentX) * blend;
        pointer.currentY += ((paused.current ? 0 : pointer.y) - pointer.currentY) * blend;
        pointer.strength += ((paused.current ? 0 : 1) - pointer.strength) * blend;
        motion.forEach((item) => {
          item.setX(pointer.currentX * item.depth);
          item.setY(pointer.currentY * item.depth);
          item.setRotation(item.plane ? pointer.currentX * 4 : 0);
          item.setFloat(Math.sin(time * Math.PI * 2 / item.period + item.phase) * item.amplitude * pointer.strength);
        });
      };
      gsap.ticker.add(render);
      scene.addEventListener('pointermove', move);
      scene.addEventListener('pointerleave', leave);
      return () => {
        gsap.ticker.remove(render);
        scene.removeEventListener('pointermove', move);
        scene.removeEventListener('pointerleave', leave);
        gsap.set(motion.flatMap((item) => [item.layer, item.float]), { clearProps: 'transform' });
      };
    });
    const context = gsap.context(() => {}, scene);
    stepPlane.current = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      context.add(() => {
        gsap.to(scene.querySelector('[data-flight]'), {
          x: completedFields.current.size * 40, y: completedFields.current.size * -22,
          duration: 0.7, ease: 'power2.inOut', overwrite: 'auto',
        });
      });
    };
    return () => { stepPlane.current = null; context.revert(); media.revert(); };
  }, []);

  useEffect(() => {
    paused.current = props.connectionState === 'connecting' || exiting || Boolean(root.current?.querySelector('form:focus-within'));
  }, [props.connectionState, exiting]);

  useEffect(() => {
    if (!exiting) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onEntered(); return; }
    const scene = root.current!;
    const plane = scene.querySelector<HTMLElement>('[data-flight]')!;
    const context = gsap.context(() => {
      const bounds = plane.getBoundingClientRect();
      const sceneBounds = scene.getBoundingClientRect();
      gsap.to(plane, {
        x: Number(gsap.getProperty(plane, 'x')) + sceneBounds.right - bounds.left + bounds.width,
        y: Number(gsap.getProperty(plane, 'y')) - bounds.bottom - bounds.height,
        rotation: -12, duration: 0.7, ease: 'power2.in', overwrite: 'auto',
        onComplete: onEntered,
      });
    }, scene);
    return () => context.revert();
  }, [exiting, onEntered]);

  return (
    <section className={styles.scene} ref={root} aria-label="Подключение к MAX" data-exiting={exiting}>
      <div className={styles.composition}>
        {decorations.map((item) => (
          <div key={item.name} className={`${styles.decoration} ${styles[item.name]}`} data-decoration={item.name} data-depth={item.depth} data-direction={item.direction} aria-hidden="true">
            <div data-flight={item.name === 'plane' ? '' : undefined}>
              <div data-parallax><div data-float>
                {'image' in item
                  ? <img src={`/connection/${item.image}.png`} alt="" draggable={false} />
                  : <div className={styles.sticker}>{item.text}</div>}
              </div></div>
            </div>
          </div>
        ))}
        <div className={styles.formSlot}
          onFocusCapture={() => { paused.current = true; }}
          onBlurCapture={(event) => {
            const from = event.target;
            const to = event.relatedTarget;
            if (from instanceof HTMLInputElement && to instanceof HTMLInputElement && from.name !== to.name && from.value.trim() && !completedFields.current.has(from.name) && !exiting) {
              completedFields.current.add(from.name);
              stepPlane.current?.();
            }
            if (!event.currentTarget.contains(to)) paused.current = props.connectionState === 'connecting' || exiting;
          }}>
          <div className={styles.brand}>GREEN-API <span>/ MAX</span></div>
          <ConnectionForm {...props} connectionState={exiting ? 'connecting' : props.connectionState} />
        </div>
      </div>
    </section>
  );
}
