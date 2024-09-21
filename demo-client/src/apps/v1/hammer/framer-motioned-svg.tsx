import {motion} from 'framer-motion';
import svgCanvas from './svg-canvas.module.scss';
import {clsx} from 'clsx';

const draw = {
  hidden: {pathLength: 0, opacity: 0},
  visible: (i: number) => {
    const delay = 1 + i * 0.5;
    return {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: {delay, type: 'spring', duration: 1.5, bounce: 0},
        opacity: {delay, duration: 0.01},
      },
    };
  },
  stroke(custom: number) {
    return {
      stroke: '#00ff00',
      transition: {
        stroke: {duration: 5},
      },
    };
  },
};

// taken from
export function FramerMotionedSvg() {
  return (
    <svg
      className={clsx(svgCanvas.styleRoot, svgCanvas.preset1)}
      width="600"
      height="600"
      viewBox="0 0 600 600"
    >
      <MotionComponent />
      <UseAnimateComponent />
    </svg>
  );
}

function MotionComponent() {
  return (
    <motion.circle
      initial={{stroke: '#ff0000', r: 0}}
      animate={{r: 200, stroke: '#00ff00'}}
      transition={{duration: 10}}
      cx={200}
      cy={200}
    ></motion.circle>
  );
}

function UseAnimateComponent() {
  return null;
}
