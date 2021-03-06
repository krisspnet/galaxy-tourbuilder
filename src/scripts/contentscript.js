/* @flow */
import ext from './utils/ext';
import storage from './utils/storage';
import { path as getPath, toggleClass, toggleAttribute } from './utils/dom';
import { ACTION_ENABLE } from './actions';
import { createPanel, getEditor } from './utils/html';
import GalaxyTour from './GalaxyTour';

let currentTour = new GalaxyTour();
let recording = false;

const newTour = ($configurator: HTMLElement) => {
  return new Promise((res, rej) => {
    const tour = new GalaxyTour();

    storage.set({ tour: tour.toYAML() }, () => {
      const $editor = getEditor($configurator);
      if ($editor) {
        $editor.value = tour.toYAML();
      }

      res(tour);
    });
  });
};

const saveTour = (tour: GalaxyTour, $configurator: HTMLElement) => {
  return new Promise((res, rej) => {
    const $editor = getEditor($configurator);
    if ($editor) {
      tour.fromYAML($editor.value);
    }

    storage.set({ tour: tour.toYAML() }, res);
  });
};

const addStepToTour = (
  tour: GalaxyTour,
  path: string,
  $configurator: HTMLElement
) => {
  return new Promise((res, rej) => {
    tour.addStep(path);

    storage.set({ tour: tour.toYAML() }, () => {
      const $editor = getEditor($configurator);
      if ($editor) {
        $editor.value = tour.toYAML();
      }

      res(tour);
    });
  });
};

const runTour = (tour: GalaxyTour) => {
  const script = document.createElement('script');
  const jsonSteps = JSON.stringify(tour.getStepsForInjection(), (k, v) => {
    if (typeof v === 'function') {
      return `(${v})`;
    }
    return v;
  });

  script.textContent = `
    (function (window, $) {
      if ($ === null || !window.Tour) {
        alert('It looks like you are not running the Galaxy Tour Builder extension into a Galaxy application, therefore the tour cannot be played.');
        return;
      }

      function parse(obj) {
        return JSON.parse(obj, (k, v) => {
          if (typeof v === 'string' && v.indexOf('function') >= 0) {
            return eval(v);
          }
          return v;
        });
      }

      var tour = new window.Tour({
        steps: parse(${JSON.stringify(jsonSteps)}),
      }, {
        orphan: true,
        delay: 150,
      });

      tour.init();
      tour.goTo(0);
      tour.restart();
    })(window, (typeof jQuery === 'undefined' ? null : jQuery));
    `;

  (document.head || document.documentElement || document).appendChild(script);
  script.remove();
};

const onClick: EventListener = (event: Event) => {
  const $configurator = document.querySelector('#tour-configurator');
  if (!$configurator) {
    return;
  }

  if ('tour-toggle' === event.target.id) {
    toggleClass($configurator, 'hidden');
    return;
  }

  if ('tour-new' === event.target.id) {
    return newTour($configurator).then(newTour => {
      currentTour = newTour;
    });
  }

  if ('tour-save' === event.target.id) {
    return saveTour(currentTour, $configurator);
  }

  if ('tour-record' === event.target.id) {
    toggleClass($configurator, 'recording');
    toggleAttribute($configurator.querySelector('#tour-run'), 'disabled');
    recording = !recording;
    return;
  }

  if ('tour-run' === event.target.id) {
    return runTour(currentTour);
  }

  const $target: HTMLElement = (event.target: any);
  const path = getPath($target, document.origin || '');
  if (
    !recording ||
    !path ||
    path === '' ||
    /(tour-configurator|popover-|tour-|uid)/.test(path) ||
    // exclude menu sections
    /title_/.test(path)
  ) {
    return;
  }

  return addStepToTour(currentTour, path, $configurator).then(updatedTour => {
    currentTour = updatedTour;
  });
};

ext.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION_ENABLE) {
    let $configurator = document.querySelector('#tour-configurator');

    if (request.value === true) {
      storage.get('tour', res => {
        if (res.tour) {
          currentTour.fromYAML(res.tour);
        }

        if (!$configurator) {
          document.body && document.body.appendChild(createPanel());
          $configurator = document.querySelector('#tour-configurator');
        }

        const $editor = getEditor($configurator);
        if ($editor) {
          $editor.value = currentTour.toYAML();
        }

        document.body && document.body.addEventListener('click', onClick);
      });
    } else {
      if ($configurator) {
        $configurator.parentNode &&
          $configurator.parentNode.removeChild($configurator);
        document.body && document.body.removeEventListener('click', onClick);
      }
    }
  }
});
