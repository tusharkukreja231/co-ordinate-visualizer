# Polar, Cylindrical and Spherical Coordinate Visualizer

## Run it

Open `index.html` in a modern desktop or mobile browser. The website has no build step or external runtime dependency.

## Use it

- Enter a coordinate set and choose **Apply**. All four input panels update to represent the same 3D point.
- Select Cartesian, Polar, Cylindrical, or Spherical above the model to highlight that system's construction. Applying an input panel automatically selects its matching view.
- Every view also draws the direct segment from the origin O to point P, alongside that system's construction and the xy-plane projection.
- Choose degrees or radians for every angular field.
- Drag point P to change x and y while keeping z fixed. Hold Shift and drag P vertically to change z, including below the xy-plane into negative z. Drag elsewhere in the model to orbit the view.
- Focus the model and use arrow keys to move in x and y. Use Shift+Up/Down to change z; hold Alt for a larger step.
- At the origin or on the z-axis, azimuth is mathematically indeterminate; the interface displays 0 by convention.

## Coordinate convention

- Cartesian: `(x, y, z)`.
- Polar + height: `(r, theta, z)`, where `r` is the xy-plane radius and `theta` is measured counter-clockwise from +x. This extends ordinary 2D polar coordinates with z so the point is fully specified in 3D.
- Cylindrical: `(rho, phi, z)`, where `rho` is the distance from the z-axis and `phi` is the xy-plane azimuth from +x.
- Spherical: `(r, theta, phi)`, where `r` is distance from the origin, `theta` is inclination from +z in `[0, 180 degrees]` (or `[0, pi]` radians), and `phi` is azimuth from +x in the xy-plane.

The spherical conversion used is `x = r sin(theta) cos(phi)`, `y = r sin(theta) sin(phi)`, and `z = r cos(theta)`. Angles are normalized for display; spherical inclination is restricted to its conventional range. Radii must be nonnegative, all values must be finite, and magnitudes are limited to 100,000 units so the canvas stays usable.

## Files

- `index.html` — page structure and coordinate controls.
- `styles.css` — responsive layout and visual styling.
- `app.js` — coordinate conversion, validation, canvas rendering, orbiting, and point dragging.
- The project report is distributed separately in the complete project package.
