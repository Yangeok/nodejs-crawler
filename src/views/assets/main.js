class ResultList extends React.Component {
  constructor(props) {
    super(props)
    console.log(props)
    this.state = {
      result: [],
    }

    this.props.socket.on('finished', data => {
      console.log(data)
      this.setState({
        result: [
          ...this.state.result,
          {
            location: data.location,
            key: data.key,
            signedAt: data.signedAt,
          },
        ],
      })
    })
  }

  async _downloadAll() {
    const _delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const links = document.getElementsByClassName('down_link')
    if (links && typeof links === 'object') {
      for (let link of links) {
        link.click()
        await _delay(500)
      }
    }
  }

  _clearAll() {
    const $ = window.$
    $('.need_remove').remove()
  }

  render() {
    const { result } = this.state
    return (
      <table className="table table-fixed">
        <thead>
          <tr>
            <th colSpan="7">
              <h4>Result</h4>
              <button
                type="button"
                className="btn btn-primary"
                id="btn"
                onClick={this._downloadAll}
              >
                Download all
              </button>{' '}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={this._clearAll}
              >
                Clear list
              </button>
            </th>
          </tr>
          <tr>
            <th>Download link</th>
            <th>Date</th>
            <th>File size</th>
          </tr>
        </thead>
        <tbody>
          {result.map(({ location, key, signedAt }, i) => (
            <tr key={i} className="need_remove">
              <td>
                <a href={location} className="down_link">
                  {key}
                </a>
              </td>
              <td>{signedAt}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
}

class RootComponent extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      socketConnected: false,
      currentTime: new Date().getTime(),
    }

    setInterval(() => {
      this.setState({
        currentTime: new Date().getTime(),
      })
    }, 1000)

    this.socket = io('/')

    this.socket.on('connect', () => {
      this.setState({
        socketConnected: true,
      })
    })

    this.socket.on('disconnect', () => {
      this.setState({
        socketConnected: false,
      })
    })

    this._handleKeyPress = this._handleKeyPress.bind(this)
    this._sendData = this._sendData.bind(this)
  }

  _handleKeyPress(event) {
    if (event.keyCode === 13) {
      this._sendData()
    }
  }

  _sendData() {
    const data = {
      keyword: $('#keyword').val(),
      _index: $('#elastic-search-index').val(),
      runSchedule: moment($('#run-schedule').val()),
      startDate: moment($('#start-date').val()).format('YYYY-MM-DD'),
      endDate: moment($('#end-date').val()).format('YYYY-MM-DD'),
      site: $('#channel').val(),
    }

    this.socket.emit('append', data)
    alert('job added')
    $('#addJobModal').modal('hide')
  }

  render() {
    const { currentTime } = this.state
    return (
      <div className="container-fluid">
        <div className="jumbotron jombotron-fluid">
          <h1 className="display-4">Crawl Engine</h1>
        </div>
        <div className="row">
          <table className="table table-fixed">
            <thead>
              <tr>
                <th colSpan="7">
                  <h4>Setting</h4>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Current Time</td>
                <td>{moment(currentTime).format('YYYY-MM-DD HH:mm:ss')}</td>
              </tr>
              <tr>
                <td>Add job</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick={() => $('#addJobModal').modal('show')}
                  >
                    Configure
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="row">
          <ResultList socket={this.socket} />
        </div>
        <div className="row">
          <div className="col-12"></div>
        </div>
        <div
          className="modal fade"
          id="addJobModal"
          tabIndex="-1"
          role="dialog"
          aria-labelledby="exampleModalLabel"
          aria-hidden="true"
        >
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="exampleModalLabel">
                  Add crawling job
                </h5>
                <button
                  type="button"
                  className="close"
                  data-dismiss="modal"
                  aria-label="Close"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <form>
                  <div className="form-group">
                    <label htmlFor="keyword">Keyword / URL</label>
                    <input
                      type="text"
                      className="form-control"
                      id="keyword"
                      defaultValue="비트코인"
                      placeholder="비트코인"
                      onKeyDown={this._handleKeyPress}
                    />
                    <small className="form-text text-muted">
                      Form: 비트코인, 리플, 이더리움[, argv] 혹은 URL
                    </small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="channel">Channel</label>
                    <select className="form-control" id="channel">
                      <option disabled value="">
                        ---------- Community ----------
                      </option>
                      <option selected value="bobaedream">
                        bobaedream
                      </option>
                      <option value="clien">clien</option>
                      <option value="cobak">cobak</option>
                      <option value="coinpan">coinpan</option>
                      <option value="cook82">cook82</option>
                      <option value="dcinside">dcinside</option>
                      <option value="ddengle">ddengle</option>
                      <option value="dogdrip">dogdrip</option>
                      <option value="gasengi">gasengi</option>
                      <option value="hygall">hygall</option>
                      <option value="ilbe">ilbe</option>
                      <option value="instiz">instiz</option>
                      <option value="inven">inven</option>
                      <option value="moneynet">moneynet</option>
                      <option value="mlbpark">mlbpark</option>
                      <option value="natePann">natePann</option>
                      <option value="ppomppu">ppomppu</option>
                      <option value="ruliweb">ruliweb</option>
                      <option value="ygosu">ygosu</option>
                      <option disabled value="">
                        ----------- Portal ------------
                      </option>
                      <option value="daumBlog">daumBlog</option>
                      <option value="daumBrunch">daumBrunch</option>
                      <option value="daumCafe">daumCafe</option>
                      <option value="daumNews">daumNews</option>
                      <option value="daumTip">daumTip</option>
                      <option value="daumTistory">daumTistory</option>
                      <option value="naverBlog">naverBlog</option>
                      <option value="naverCafe">naverCafe</option>
                      <option value="naverKin">naverKin</option>
                      <option value="naverNews">naverNews</option>
                      <option value="naverPost">naverPost</option>
                      <option value="naverShopping">naverShopping</option>
                      <option disabled value="">
                        ------------- SNS -------------
                      </option>
                      <option value="instagram">instagram</option>
                      <option value="instagramComments">
                        instagramComments
                      </option>
                      <option value="instagramInPostComments">
                        instagramInPostComments
                      </option>
                      <option value="twitter">twitter</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="keyword">ElasticSearch index name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="elastic-search-index"
                      defaultValue="yangeok_test"
                      placeholder="yangeok_test"
                      onKeyDown={this._handleKeyPress}
                    />
                    <small className="form-text text-muted">
                      For using ElasticSearch
                    </small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="keyword">Job scheduling</label>
                    <input
                      type="text"
                      className="form-control"
                      id="run-schedule"
                      defaultValue={moment().format('YYYY-MM-DD HH:mm:ss')}
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      onKeyDown={this._handleKeyPress}
                    />
                    <small className="form-text text-muted">
                      Form: YYYY-MM-DD hh:mm:ss
                    </small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="keyword">Start date</label>
                    <input
                      type="text"
                      className="form-control"
                      id="start-date"
                      defaultValue={moment().format('YYYY-MM-DD')}
                      placeholder="YYYY-MM-DD"
                      onKeyDown={this._handleKeyPress}
                    />
                    <small className="form-text text-muted">
                      Form: YYYY-MM-DD
                    </small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="keyword">End date</label>
                    <input
                      type="text"
                      className="form-control"
                      id="end-date"
                      defaultValue={moment().format('YYYY-MM-DD')}
                      placeholder="YYYY-MM-DD"
                      onKeyDown={this._handleKeyPress}
                    />
                    <small className="form-text text-muted">
                      Form: YYYY-MM-DD
                    </small>
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-dismiss="modal"
                >
                  Close
                </button>
                <div></div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={this._sendData}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

ReactDOM.render(<RootComponent />, document.getElementById('app'))
