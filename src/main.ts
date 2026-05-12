import './styles.css';
import { init } from './render';
import { addItem, toggleDone } from './state';

seedSampleData();

const root = document.getElementById('app');
if (root) init(root);

function seedSampleData(): void {
  addItem('Email Marco about onboarding doc', 'today');
  addItem('Finish CycleWatch offline sync prototype', 'today');
  const coffee = addItem('Coffee with Sarah', 'today');
  addItem('Read draft of design spec', 'today');
  toggleDone(coffee.id);

  addItem('Book flights for July', 'soon');
  addItem('Review skincare progress photos', 'soon');
  addItem('Reply to Anna about workshop', 'soon');

  addItem('Research router table options', 'later');
  addItem('Plan workshop layout', 'later');
}

export const buildInfo = {
  sha: __BUILD_SHA__,
  time: __BUILD_TIME__,
};
