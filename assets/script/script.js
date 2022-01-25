'use strict';

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const remove = document.querySelector('.remove-workout');
const sorted = document.querySelector('.sorted');
const sortContainer = document.querySelector('.sort_container');
const resetButton = document.querySelector('.reset_button');
const resetContainer = document.querySelector('.reset_container');
const modal = document.querySelector('.modal');
const overlay = document.querySelector('.overlay');
const yesButton = document.querySelector('.button_yes');
const noButton = document.querySelector('.button_no');
const overviewContainer = document.querySelector('.overview_container');
const overviewButton = document.querySelector('.overview_button');

class Workout {
  id = (Date.now() + '').slice(-10);
  clicks = 0;

  constructor(coords, distance, duration, date) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // min
    this.date = date;
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const date = new Date(this.date);
    const day = `${date.getDate()}`.padStart(2, 0);
    const month = `${date.getMonth()}`;
    const year = `${date.getFullYear()}`.padStart(2, 0);
    const hours = `${date.getHours()}`.padStart(2, 0);
    const min = `${date.getMinutes()}`.padStart(2, 0);
    const sec = `${date.getSeconds()}`.padStart(2, 0);

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[month]
    }  ${day} - at ${hours}: ${min}: ${sec}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, date, cadence) {
    super(coords, distance, duration, date);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';
  constructor(coords, distance, duration, date, elevationGain) {
    super(coords, distance, duration, date);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    //km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

const run1 = new Running([39, -12], 5.2, 24, 178);
const cycling1 = new Cycling([39, -12], 27, 95, 523);

/////////////////////////////////////////////////////////////////////////////////////////

// APPLICATION ARCHITECTURE
class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  markers = [];

  constructor() {
    // Get user position
    this._getPosition();

    // // Get data from local storage
    this._getLocalStorage();

    // Attach event handler

    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField.bind(this));
    containerWorkouts.addEventListener(
      'click',
      this._handlerWorkoutClick.bind(this)
    );
    yesButton.addEventListener('click', this.resetBtn.bind(this));
    noButton.addEventListener('click', this.modalHidden.bind(this));
    overlay.addEventListener('click', this.modalHidden.bind(this));
    document.addEventListener('keydown', this.reset);
    sortContainer.addEventListener('click', this._sortAndRender.bind(this));
    resetButton.addEventListener('click', this.modalActivate.bind(this));
    overviewButton.addEventListener('click', this.overview.bind(this));
  }

  _getPosition() {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not get your position');
        }
      );
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;
    const coords = [latitude, longitude];

    this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling click on map
    this.#map.on('click', this._showForm.bind(this));

    this.#workouts.forEach(work => this._renderWorkoutMarker(work));

    if (this.#workouts.length > 0) {
      this.overview();
    }
  }

  _getId(e) {
    // detect workout element on click
    const element = e.target.closest('.workout');
    if (element) {
      // get info about the workout that was clicked on
      const id = element.dataset.id;
      const foundWorkout = this.#workouts.find(elem => elem.id === id);
      const workoutIndex = this.#workouts.indexOf(foundWorkout);
      return [id, foundWorkout, workoutIndex, element];
    }
    return [];
  }

  _handlerWorkoutClick(e) {
    // find info about workout tha was clicked
    const [id, foundWorkout, workoutIndex, element] = this._getId(e);
    if (!id) return;
    // remove workout
    if (e.target.classList.contains('remove-workout')) {
      this._removeWorkout(element, workoutIndex);
      return;
    }
    // than set into this view
    this._setIntoView(foundWorkout, this.#mapZoomLevel);
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hideForm() {
    // Clear inputs
    inputDistance.value = '';
    inputDuration.value = '';
    inputCadence.value = '';
    inputElevation.value = '';

    form.classList.add('hidden');
  }

  _toggleElevationField() {
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));

    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    // Get data from the form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const date = Date.now();
    const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    // If activity running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;
      // Check if data is valid
      if (
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return alert('Input have to be a positive number!!!');

      workout = new Running([lat, lng], distance, duration, date, cadence);
    }

    // If activity cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      // Check if data is valid
      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return alert('Input have to be a positive number!!!');

      workout = new Cycling([lat, lng], distance, duration, date, elevation);
    }

    // Add the new object to workout array
    this.#workouts.push(workout);

    // Render workout on map as marker
    this._renderWorkoutMarker(workout);

    // Render workout on list
    this._renderWorkoutList(workout);

    // Hide form + Clear input fields
    this._hideForm();

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  _renderWorkoutMarker(workout) {
    const id = workout.id;

    const customIcon = L.icon({
      iconUrl: 'assets/img/maps.png',
      iconSize: [50, 50],
      iconAnchor: [25, 1],
    });

    let layer = L.marker(workout.coords, { icon: customIcon })
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 350,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃' : '🚴'} ${workout.description}`
      )
      .openPopup();

    layer.id = id;

    this.markers.push(layer);
  }

  _renderWorkoutList(workout) {
    let html = `
    <li class="workout workout--${workout.type}" data-id="${workout.id}">
      <h2 class="workout__title">${workout.description}</h2>
      <div class="workout__details">
        <span class="workout__icon">${
          workout.type === 'running' ? '🏃' : '🚴'
        } </span>
        <span class="workout__value">${workout.distance}</span>
        <span class="workout__unit">km</span>
    </div>
    <div class="workout__details">
      <span class="workout__icon">⏱</span>
      <span class="workout__value">${workout.duration}</span>
      <span class="workout__unit">min</span>

    </div>`;

    if (workout.type === 'running') {
      html += `
      <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.pace.toFixed(1)}</span>
            <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">🦶🏼</span>
            <span class="workout__value">${workout.cadence}</span>
            <span class="workout__unit">spm</span>
            </div>
            <button class="remove-workout">X</button>
          </li>`;
    }

    if (workout.type === 'cycling') {
      html += `
        <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.speed.toFixed(1)}</span>
            <span class="workout__unit">km/h</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span class="workout__value">${workout.elevationGain}</span>
            <span class="workout__unit">m</span>
          </div>
          <button class="remove-workout">X</button>
      </li>`;
    }

    form.insertAdjacentHTML('afterend', html);

    sortContainer.classList.remove('hidden');
    resetContainer.classList.remove('hidden');
    overviewContainer.classList.remove('hidden');
  }

  _setIntoView(foundWorkout, level) {
    this.#map.setView(foundWorkout.coords, level, {
      animate: true,
      pan: {
        duration: 1,
      },
    });
  }

  overview() {
    if (this.#workouts.length === 0) return;

    const latitudes = this.#workouts.map(w => {
      return w.coords.at(0);
    });
    const longitudes = this.#workouts.map(w => {
      return w.coords.at(1);
    });
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLong = Math.min(...longitudes);
    const maxLong = Math.max(...longitudes);

    // fit bounds with coordinates
    this.#map.fitBounds(
      [
        [maxLat, minLong],
        [minLat, maxLong],
      ],
      { padding: [70, 70], maxZoom: 13 }
    );
  }

  _sortAndRender(e) {
    const element = e.target.closest('.sorted');
    let currentDirection = 'descending';
    const type = element.dataset.type;

    const typeValues = this.#workouts.map(workout => workout[type]);
    const sortedUp = typeValues
      .slice()
      .sort((a, b) => a - b)
      .join('');
    const sortedDown = typeValues
      .slice()
      .sort((a, b) => b - a)
      .join('');

    if (typeValues.join('') === sortedUp) {
      currentDirection = 'ascending';
    }

    if (typeValues.join('') === sortedDown) {
      currentDirection = 'descending';
    }

    // sort main workouts array
    this._sortArray(this.#workouts, currentDirection, type);

    /// RE-RENDER ///
    containerWorkouts
      .querySelectorAll('.workout')
      .forEach(workout => workout.remove());
    this.#workouts.forEach(work => this._renderWorkoutList(work));
  }

  _sortArray(array, currentDirection, type) {
    if (currentDirection === 'ascending') {
      array.sort((a, b) => b[type] - a[type]);

      console.log(array);
    }

    if (currentDirection === 'descending') {
      array.sort((a, b) => a[type] - b[type]);
    }
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.#workouts = data;
    data.forEach(work => this._renderWorkoutList(work));
  }

  reset(e) {
    if (e.key === 'Escape') {
      localStorage.removeItem('workouts');
      location.reload();
    }
  }

  resetBtn() {
    localStorage.removeItem('workouts');
    location.reload();
  }

  _removeWorkout(element, workoutIndex) {
    // remove elemento from the list
    element.remove();

    // remove markers
    this.markers.at(workoutIndex).remove();
    this.markers.splice(workoutIndex, 1);
    this.#workouts.splice(workoutIndex, 1);

    // if workout array is empty remove local storage, hidden class list and reload the page
    if (this.#workouts.length === 0) {
      sortContainer.classList.add('hidden');
      resetContainer.classList.add('hidden');
      overviewContainer.classList.add('hidden');
      form.classList.add('hidden');
      localStorage.removeItem('workouts');
    }
    // set view after removed an element
    const lastWorkout = this.#workouts.at(-1);
    this._setIntoView(lastWorkout);

    // set local storage after removed an element
    this._setLocalStorage();

    return this.#workouts;
  }

  modalActivate() {
    modal.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }

  modalHidden() {
    modal.classList.add('hidden');
    overlay.classList.add('hidden');
  }
}

const app = new App();
