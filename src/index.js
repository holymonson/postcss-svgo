import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import SVGO from 'svgo';
import isSvg from 'is-svg';
import {encodeSVGDatauri, decodeSVGDatauri} from 'svgo/lib/svgo/tools';

const dataURI = /data:image\/svg\+xml/;

function minifyPromise (svgo, decl, opts) {
    const promises = [];

    decl.value = valueParser(decl.value).walk(node => {
        if (node.type !== 'function' || node.value !== 'url' || !node.nodes.length) {
            return;
        }

        const value = node.nodes[0].value;
        const data = decodeSVGDatauri(value);
        if (!isSvg(data)) {
            return;
        }

        let isUriEncoded = opts.encode;
        if (isUriEncoded === undefined) {
            isUriEncoded = value.indexOf(data) === -1;
        }

        promises.push(new Promise((resolve, reject) => {
            svgo.optimize(data, result => {
                if (result.error) {
                    return reject(`Error parsing SVG: ${result.error}`);
                }
                node.before = node.after = '';
                node.nodes[0].value = encodeSVGDatauri(result.data, isUriEncoded ? 'enc' : 'unenc');
                node.nodes[0].quote = isUriEncoded ? '"' : '\'';
                node.nodes[0].type = 'string';
                resolve();
            });
        }));

        return false;
    });

    return Promise.all(promises).then(() => decl.value = decl.value.toString());
}

export default postcss.plugin('postcss-svgo', (opts = {}) => {
    let svgo = new SVGO(opts);
    return css => {
        return new Promise((resolve, reject) => {
            let promises = [];
            css.walkDecls(decl => {
                if (dataURI.test(decl.value)) {
                    promises.push(minifyPromise(svgo, decl, opts));
                }
            });
            Promise.all(promises).then(resolve, reject);
        });
    };
});
