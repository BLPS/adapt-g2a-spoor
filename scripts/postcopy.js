const xml2js = require('xml2js');

let currentPageNumber = 0;

const loopScoItems = function (level, levels, defaultItem, contentObjectsData, parentID) {
  const items = [];
  const nextLevel = level + 1;

  if (level > levels) { return null; }
  const objects = contentObjectsData.filter((object) => object._parentId === parentID);
  if (!objects.length > 0) { return null; }

  for (const object of objects) {
    const modelType = typeof object._type !== 'undefined' ? object._type : null;
    const menuConfig = typeof object._listMenu !== 'undefined' ? object._listMenu : { _pageNumber: 0 };

    const pageNumber = getPageNumber(modelType, menuConfig);
    object._pageNumber = pageNumber;

    const item = JSON.parse(JSON.stringify(defaultItem));
    const menuTitle = object?.displayTitle.length > 0 ? object.displayTitle : object.title;
    item.$.identifier = 'IA_' + object._id;
    item.$.identifierref = 'A_' + object._id;
    item.title = [menuTitle];
    item.itemTitle = [object.title];
    item.itemDisplayTitle = [object.displayTitle];
    item.itemSubtitle = [object.subtitle];
    item.page = pageNumber;
    if (nextLevel <= levels) {
      const children = loopScoItems(nextLevel, levels, defaultItem, contentObjectsData, object._id);
      if (children !== null) {
        delete item.$.identifierref;
        item.item = children;
      }
    }
    items.push(item);
  }
  return items.length > 0 ? items : null;
};

const getPageNumber = function (modelType, menuConfig) {
  let pageNumber = typeof menuConfig._pageNumber !== 'undefined' ? menuConfig._pageNumber : 0;
  let tmpPageNumber = 0;
  if (modelType === 'page') {
    pageNumber = pageNumber && parseInt(pageNumber) > 0 ? parseInt(pageNumber) : 0;
    if (!pageNumber || pageNumber < 0) { pageNumber = 1; }
    if (currentPageNumber > pageNumber) { pageNumber = currentPageNumber; }
    currentPageNumber = pageNumber + 1;
  } else {
    if (pageNumber && parseInt(pageNumber) > 0) {
      tmpPageNumber = parseInt(pageNumber);
    }
    if (tmpPageNumber && tmpPageNumber > 0) {
      if (currentPageNumber > tmpPageNumber) {
        pageNumber = currentPageNumber;
      } else {
        currentPageNumber = tmpPageNumber;
      }
    } else {
      if (currentPageNumber > 1) {
        pageNumber = currentPageNumber;
      } else {
        pageNumber = 1;
        currentPageNumber = 1;
      }
    }
  }
  return pageNumber;
};

const loopScoResources = function (level, levels, defaultResource, contentObjectsData, parentID) {
  let resources = [];
  const nextLevel = level + 1;

  if (level > levels) { return null; }
  const objects = contentObjectsData.filter((object) => object._parentId === parentID);
  if (!objects.length > 0) { return null; }

  for (const object of objects) {
    const resource = JSON.parse(JSON.stringify(defaultResource));
    resource.$.identifier = 'A_' + object._id;
    resource.$.href = 'index_lms.html?content=' + object._id + '&startpage=' + object._pageNumber;
    let childResources = null;

    if (nextLevel <= levels) {
      childResources = loopScoResources(nextLevel, levels, defaultResource, contentObjectsData, object._id);
    }

    if (childResources !== null) {
      resources = resources.concat(childResources);
    } else {
      resources.push(resource);
    }
  }
  return resources.length > 0 ? resources : null;
};

module.exports = async function(fs, path, log, options, done) {
  try {
    const buildPath = options.outputdir;
    const coursePath = `${buildPath}${options.coursedir}`;
    const data = await fs.promises.readFile(`${coursePath}/config.json`);
    if (!data) return done();
    const config = JSON.parse(data.toString());
    const scormVersion = config?._g2aSpoor?._advancedSettings?._scormVersion ?? '2004';
    const scoMode = config?._g2aSpoor?._advancedSettings?._scoMode ?? false;
    const scoSplitLevel = parseInt(config?._g2aSpoor?._advancedSettings?._scoSplitLevel ?? 2);
    const scormPath = `${options.plugindir}/scorm/${scormVersion}`;
    const files = await fs.promises.readdir(`${scormPath}`);
    if (!files) return done();
    await Promise.all(files.map(file => fs.promises.copyFile(`${scormPath}/${file}`, `${buildPath}/${file}`)));

    if (scoMode === true && scoSplitLevel > 0) {
      const imsmanifest = await fs.promises.readFile(`${buildPath}/imsmanifest.xml`);
      const contentObjects = await fs.promises.readFile(`${buildPath}/course/en/contentObjects.json`);
      const contentObjectsData = JSON.parse(contentObjects.toString());

      // eslint-disable-next-line n/handle-callback-err
      xml2js.parseString(imsmanifest, (err, result) => {
        const organization = result.manifest.organizations[0].organization[0];
        const defaultItem = JSON.parse(JSON.stringify(organization.item[0]));

        const items = loopScoItems(1, scoSplitLevel, defaultItem, contentObjectsData, 'course');
        if (items !== null) {
          // eslint-disable-next-line no-use-before-define
          result.manifest.organizations[0].organization[0].item = items;

          const defaultResource = JSON.parse(JSON.stringify(result.manifest.resources[0].resource[0]));
          const resources = loopScoResources(1, scoSplitLevel, defaultResource, contentObjectsData, 'course');
          result.manifest.resources[0].resource = result.manifest.resources[0].resource.concat(resources);

          const builder = new xml2js.Builder();
          const xml = builder.buildObject(result);
          fs.promises.writeFile(`${buildPath}/imsmanifest.xml`, xml);
        }
      });
    }
  } catch (err) {
    log(err);
  }
  done();
};
